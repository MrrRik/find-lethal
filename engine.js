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
  const wardOf = (c) => { for (const k of keywords(c)) { const m = /^ward (\d+)$/.exec(k); if (m) return Number(m[1]); } return 0; };
  const indestructible = (c) => has(c, "indestructible");

  // CR 702.168a-b / 708.2: a face-down permanent (disguise) is a 2/2 creature with ward {2} and no name, subtypes, mana
  // cost or other abilities. The card itself is kept in c.hidden (its controller may look at it, CR 708.5).
  const FACE_DOWN = { name: "Face-down creature", type: "Creature", pt: "2/2", kw: ["ward 2"], colors: [] };
  const FACE_DOWN_KEEP = ["id", "owner", "tapped", "sick", "counters", "dmg", "attachedTo", "ts", "deathtouched", "wasCast", "suspected"];
  function faceDownOf(card) {
    const hidden = { ...card };
    [...FACE_DOWN_KEEP.filter((k) => k !== "id" && k !== "owner"), "faceDown", "st", "tk"].forEach((k) => delete hidden[k]);
    const out = { ...FACE_DOWN, kw: [...FACE_DOWN.kw], faceDown: true, hidden };
    FACE_DOWN_KEEP.forEach((k) => { if (k in card && k !== "faceDown") out[k] = card[k]; });
    return out;
  }
  // CR 701.60: a suspected creature has menace and "This creature can't block" for as long as it's suspected
  const ownKw = (c) => (c.suspected ? [...(c.kw || []), "menace", "can't block"] : c.kw || []);

  // A permanent's activated abilities; Equipment's equip ability is one of them (sorcery speed)
  function abilitiesOf(c) {
    // CR 702.168d / 116.2b: turning a face-down disguise card face up is a special action, any time you have priority
    // (not an ability: it doesn't use the stack and can't be lost). It's offered like an ability with `special`.
    if (c.faceDown) return c.hidden && c.hidden.disguise ? [{ special: "turnFaceUp", cost: c.hidden.disguise, text: `Turn face up ${c.hidden.disguise}` }] : [];
    if (c.st && c.st.lost) return [];                          // it lost all its abilities (CR 613.1f)
    const list = [...(c.abilities || [])];
    if (c.equip) list.push({ cost: c.equip.cost, targets: "creature", filter: { controller: "you" }, sorcery: true, effect: { attach: true },
      text: `Equip ${c.equip.cost}` });
    // CR 702.122a: "Crew N" — tap any number of other untapped creatures you control with total power N or more:
    // this Vehicle becomes an artifact creature until end of turn (the crew is chosen as a.crew)
    keywords(c).forEach((k) => { const m = /^crew (\d+)$/.exec(k); if (m) list.push({ crew: Number(m[1]), effect: { becomeCreature: true, self: true }, text: `Crew ${m[1]}` }); });
    // CR 702.167a: craft: { cost, filter, text } — "[Cost], Exile this, Exile [a material] from among permanents you
    // control and/or cards in your graveyard: Return this card transformed. Activate only as a sorcery." (a.craft: the material)
    if (c.craft && !c.transformed) list.push({ cost: c.craft.cost, sorcery: true, craft: c.craft, effect: { craftReturn: true }, text: c.craft.text || `Craft ${c.craft.cost}` });
    // CR 719.3c: a Case's "Solved — [ability]" can only be activated once it's solved
    return list.filter((ab) => !ab.ifSolved || c.solved);
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
    if (f.aura) return [{ effect: { attach: true }, targets: f.aura.targets || "creature", filter: f.aura.filter, count: ONE, target: a.target }];
    if (f.modes) {
      const many = (f.chooseCount || 1) > 1;
      const picks = many ? [].concat(a.mode == null ? [] : a.mode) : [a.mode];
      return picks.map((mi, k) => {
        const m = f.modes[mi] || {};
        return { effect: m.effect, targets: m.targets, filter: m.targetFilter, count: m.targetCount || ONE, target: many ? (a.target || [])[k] : a.target };
      });
    }
    if (f.slots) return [{ effect: f.effect, slots: f.slots, target: a.target }];
    if (f.divided != null) {
      return [{ effect: { divided: true }, targets: f.targets || "any", filter: f.targetFilter, count: f.targetCount || { min: 1, max: 3 },
        target: a.target, split: a.split, total: dividedTotal(f, a.x) }];
    }
    return [{ effect: f.effect, targets: f.targets, filter: f.targetFilter, count: f.targetCount || ONE, target: a.target }];
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
    (f.extraCostPerTarget && Array.isArray(a.target) && a.target.length > 1 ? `{${f.extraCostPerTarget * (a.target.length - 1)}}` : "") +
    (f.behold && f.behold.orPay && a.behold === "pay" ? f.behold.orPay : "") +
    (f.blight && f.blight.orPay && a.blight === "pay" ? f.blight.orPay : "");
  // CR 702.41a: "affinity for artifacts" — costs {1} less for each artifact you control; lessPer: { filter, n } is the
  // same for other "costs {n} less to cast for each …" spells. CR 601.2f: only the generic part goes down, not below 0
  // bargainLess: "This spell costs {N} less to cast if it's bargained"
  function reducedCost(s, f, cost, a = {}) {
    const per = [...keywords(f).map((k) => /^affinity for (artifacts|equipment)$/i.exec(k)).filter(Boolean)
      .map((m) => ({ filter: m[1].toLowerCase() === "artifacts" ? { artifact: true } : { type: "Equipment" }, n: 1 })),
      ...(f.lessPer ? [f.lessPer] : [])];
    // ("This spell costs {2} less to cast if evidence was collected": evidenceLess)
    const flat = (f.bargainLess && a.bargain != null ? f.bargainLess : 0) + (f.evidenceLess && a.evidence != null ? f.evidenceLess : 0);
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
    if (isLand(c)) {
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
    const pool = s.pool.map((sym, i) => ({ id: "pool:" + i, colors: sym === "*" ? "WUBRG" : sym, kind: "pool" }));
    const field = s.player.battlefield.filter((c) => !exclude.includes(c.id))
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
  const find = (s, id) => s.player.battlefield.find((c) => c.id === id) || s.opponent.battlefield.find((c) => c.id === id);
  const inMain = (s) => s.phase === "main1" || s.phase === "main2";
  // CR 307.1 / 505.6a / 602.5d: sorcery speed is your main phase with an empty stack (lands too, CR 305.2 / 116.2a)
  const sorceryTime = (s) => inMain(s) && !s.stack.length;
  // You get priority in every step except untap and cleanup; the turn is over once cleanup begins
  const hasPriority = (s) => at(s.phase) >= at("upkeep") && at(s.phase) < at("cleanup");
  const turnOver = (s) => at(s.phase) >= at("cleanup") || dead(s.player);
  const canAttackNow = (s) => !s.attacked && !s.pending.length && !s.stack.length && (s.phase === "main1" || s.phase === "boc");

  // A permanent leaves the battlefield. CR 603.10a: leaves-the-battlefield triggers (dies, sacrificed, leaves) look
  // back in time: they're checked against the permanents just before the event (the leaving one included), using
  // last known information (CR 113.7a). Simultaneous events pass the same `lookBack` snapshot (CR 603.10).
  function leave(s, card, zone, ev, { sacrificed = false, lookBack } = {}) {
    const side = sideOf(s, card);
    // CR 614.6: replacement effects change where it goes before anything happens ("exile it instead")
    zone = replaceMove(s, card, "battlefield", zone, side);
    // (the snapshot and last known information are only built if something in the puzzle listens)
    const heard = ["sacrificed", "leaves", "dies"].some((t) => s.listens.includes(t));
    const before = heard ? lookBack || battlefieldNow(s) : null;
    const last = heard ? lastKnown(card) : { id: card.id, type: card.type };
    if (referenced(s, card.id)) (s.lki = s.lki || {})[card.id] = lastKnown(card);   // its triggers still need it (CR 113.7a)
    s[side].battlefield = s[side].battlefield.filter((c) => c !== card);
    changed(s);
    // CR 400.7: effects on it end with it; if the card comes back, it's a new object they don't apply to — and spells
    // and abilities that targeted it now target nothing there (CR 608.2b: no longer in the zone it was in)
    if (s.effects && s.effects.length) s.effects = s.effects.filter((e) => e.id !== card.id);
    if (s.stack.length || s.pending.length) forgetTarget(s, card.id);
    ev.push({ type: "left", id: card.id, zone });
    if (sacrificed) emit(s, { type: "sacrificed", obj: last, side }, ev, before);
    emit(s, { type: "leaves", obj: last, side, to: zone }, ev, before);
    // CR 700.4: "dies" means put into a graveyard from the battlefield (a token dies too, then ceases to exist)
    if (zone === "graveyard" && isCreature(card)) emit(s, { type: "dies", obj: last, side }, ev, before);
    if (card.token) return;                                      // CR 111.7: tokens cease to exist
    // CR 712.8a: off the battlefield a double-faced card has only its front face's characteristics
    // CR 708.9: a face-down permanent is revealed as it leaves: the card goes there face up
    const fresh = card.faceDown ? { ...card.hidden, id: card.id } : card.transformed ? { id: card.id, owner: card.owner, faces: card.faces, layout: card.layout, ...card.faces[0] } : { ...card };
    ["dmg", "tapped", "sick", "deathtouched", "owner", "counters", "attachedTo", "st", "ts", "loyaltyUsed", "bargained", "wasCast", "suspected", "solved", "evidenced"].forEach((k) => delete fresh[k]);   // CR 400.7
    putCard(s, fresh, card.owner || side, zone);
  }

  /* ---------- copies (CR 707) ---------- */
  // CR 707.2: a copy gets only the copiable values — the printed characteristics (and other copy effects) — not
  // counters, damage, tapped state or effects; CR 707.9a: what an "except" adds becomes part of them
  const NOT_COPIED = ["id", "owner", "tapped", "counters", "dmg", "sick", "attachedTo", "ts", "deathtouched", "loyaltyUsed",
    "token", "chosenColor", "transformed", "faces", "layout", "onAdventure", "tk", "entersAsCopy",
    "hidden", "faceDown", "suspected", "solved", "evidenced", "playable"];   // (designations aren't copiable: CR 701.60b, 719.3b)
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
      const pick = choose(s, `Copy of ${f.name}: new target?`, ["Keep the same target", ...others.map((t) => `New target: ${nameIn(s, t)}`)], side);
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
  function choose(s, name, labels, chooser) {
    const ctx = CHOICES[CHOICES.length - 1];
    if (!ctx || labels.length < 2) return 0;
    const k = ctx.i++;
    if (ctx.list[k] != null) return ctx.list[k];
    if (chooser === "player") throw new NeedChoice({ name, labels, k });
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
  const dynamicKey = (s) => `${s.player.poison || 0}|${s.opponent.poison || 0}|${s.celebration || 0}|${s.player.graveyard.length}|` +
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
    const sources = all.filter(({ card: p }) => p.static || p.perOther || p.perCounter || p.conditional ||
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
        matches(s, target, src.static.filter, srcSide) && !(src.static.other && target === src)) out.push({ ts: src.ts, ...src.static.team });
      if (src.perOther && src === target) {                    // "gets +2/+0 for each other Goblin you control"
        const n = s[srcSide].battlefield.filter((x) => x !== src && hasType(x, src.perOther.type)).length;
        if (n) out.push({ ts: src.ts, pump: [src.perOther.pump[0] * n, src.perOther.pump[1] * n] });
      }
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
      if (!effectsOn(c).some((e) => e.becomeCreature) || /creature/i.test(c.type)) continue;
      typeOf.set(c, c.type.replace(/^([^—]*?)\s*(—|$)/, (m, t, dash) => `${t} Creature${dash ? " —" : ""}`));
      setSt(c, { kw: ownKw(c), base: basePT(c), mod: [0, 0], lost: false, type: typeOf.get(c) });
    }
    const typed = (c) => (typeOf.has(c) ? { type: typeOf.get(c) } : {});
    const layer6 = (c, effects) => {
      let kw = [...ownKw(c)], lost = false;
      effects.filter((e) => e.grant || e.loseAll).sort(byTs).forEach((e) => {
        if (e.loseAll) { kw = []; lost = true; }                // CR 613.1f: removes abilities (from earlier effects too)
        if (e.grant) kw.push(...e.grant);
      });
      return { kw, lost };
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
        setSt(c, { kw: ownKw(c), base: c.vividPower ? [vividCount(s, sideOf(s, c)), base[1]] : base, mod: [0, 0], lost: false, ...colors });
        continue;
      }
      const { kw, lost } = layer6(c, effects);
      // layer 7a: a characteristic-defining ability (vivid: power = colors among your permanents) — gone if lost
      let base = basePT(c);
      if (c.vividPower && !lost) base = [vividCount(s, sideOf(s, c)), base[1]];
      // layer 7b: "has base power and toughness 1/1", in timestamp order (the latest wins)
      effects.filter((e) => e.setBase).sort(byTs).forEach((e) => { base = [...e.setBase]; });
      // layer 7c: modifications (+N/+N); the order inside a sublayer doesn't change a sum
      const mod = [0, 0];
      effects.filter((e) => e.pump).forEach((e) => { mod[0] += e.pump[0]; mod[1] += e.pump[1]; });
      setSt(c, { kw, base, mod, lost, ...colors, ...typed(c) });
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
          if (!host || sideOf(s, host) !== sideOf(s, c) || protectedFrom(host, c)) { delete c.attachedTo; changed(s); again = true; }
        }
      }
      // CR 704.5z / 303.7a: a permanent with more than one Role from the same player keeps only the newest
      for (const side of ["player", "opponent"]) {
        const roles = s[side].battlefield.filter((c) => c.attachedTo && /\bRole\b/.test(c.type || ""));
        const newest = {};
        roles.forEach((r) => { if (!newest[r.attachedTo] || r.roleSeq > newest[r.attachedTo].roleSeq) newest[r.attachedTo] = r; });
        roles.filter((r) => newest[r.attachedTo] !== r).forEach((r) => { leave(s, r, "graveyard", ev); again = true; });
      }
      // CR 704.3: all applicable state-based actions happen at once, so creatures that die together see each
      // other die (CR 603.10a look-back: one snapshot for all of them)
      const dying = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => (isCreature(c) && (toughness(c) <= 0 ||   // CR 704.5f
        (!indestructible(c) && ((c.dmg || 0) >= toughness(c) || c.deathtouched)))) ||                                      // CR 704.5g, 704.5h
        (isPlaneswalker(c) && loyaltyOf(c) <= 0) ||                                                                         // CR 704.5i
        (isBattle(c) && defenseOf(c) <= 0 && !referenced(s, c.id)));                                                        // CR 704.5v
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
    if (!n || side.life == null) return;
    side.life += n;
    ev.push({ type: "life", who, amount: n });
  }

  // Damage from any source (spell, ability or combat): protection prevents it; wither and infect
  // deal it to creatures as -1/-1 counters; infect deals it to players as poison counters
  function dealDamage(s, src, srcSide, to, n, ev, { combat = false } = {}) {
    if (!(n > 0)) return;
    // CR 615: prevention effects ("prevent all combat damage that would be dealt this turn": Fog), unless an effect
    // says damage can't be prevented (CR 615.12)
    if (combat && s.preventCombat && !s.noPrevention) { ev.push({ type: "prevented", id: to }); return; }
    // (the sources of yours that dealt damage this turn, kept only when a card asks: Case of the Burning Masks)
    const dealt = () => { if (s.tracksSources && srcSide === "player" && !(s.dmgSources || []).includes(src.id)) s.dmgSources = [...(s.dmgSources || []), src.id].sort(); };
    if (to === "opp" || to === "you") {
      const side = s[to === "opp" ? "opponent" : "player"];
      dealt();
      if (has(src, "infect")) {
        side.poison = (side.poison || 0) + n;
        ev.push({ type: "poison", who: to, amount: n });
      } else changeLife(s, to, -n, ev);
      // CR 702.164c: combat damage to a player from a creature with toxic also gives that many poison counters (its
      // total toxic value, CR 702.164b), in addition to the damage
      const toxic = combat ? toxicOf(src) : 0;
      if (toxic) { side.poison = (side.poison || 0) + toxic; ev.push({ type: "poison", who: to, amount: toxic }); }
      // "whenever this creature deals combat damage to a player" (CR 510.3a: triggers after the damage is dealt)
      if (combat) emit(s, { type: "combatDamage", obj: src, side: srcSide, to }, ev);
    } else {
      const t = find(s, to);
      if (!t) return;
      // protection prevents the damage, unless an effect says damage can't be prevented this turn
      if (protectedFrom(t, src) && !s.noPrevention) { ev.push({ type: "prevented", id: t.id }); return; }
      dealt();
      // CR 120.3c: damage to a planeswalker removes that many loyalty counters (a planeswalker creature takes both)
      if (isPlaneswalker(t)) {
        t.counters = { ...(t.counters || {}), loyalty: Math.max(loyaltyOf(t) - n, 0) };
        if (!isCreature(t)) {
          ev.push({ type: "damage", id: t.id, amount: n });
          if (has(src, "lifelink")) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
          return;
        }
      }
      // CR 120.3h / 310.6: damage to a battle removes that many defense counters; a Siege whose last one is removed
      // triggers (CR 310.12b, "defeated")
      if (isBattle(t)) {
        const before = defenseOf(t);
        t.counters = { ...(t.counters || {}), defense: Math.max(before - n, 0) };
        ev.push({ type: "damage", id: t.id, amount: n });
        if (has(src, "lifelink")) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
        if (before > 0 && defenseOf(t) === 0) emit(s, { type: "defeated", obj: t, side: sideOf(s, t) }, ev);
        return;
      }
      if (has(src, "infect") || has(src, "wither")) {
        t.counters = { ...(t.counters || {}) };
        t.counters["-1/-1"] = (t.counters["-1/-1"] || 0) + n;
      } else t.dmg = (t.dmg || 0) + n;
      if (has(src, "deathtouch")) t.deathtouched = true;
      ev.push({ type: "damage", id: t.id, amount: n });
    }
    if (has(src, "lifelink")) changeLife(s, srcSide === "player" ? "you" : "opp", n, ev);
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
  const TRIGGER_FIELDS = ["triggers", "etb", "onDeath", "onAttack", "landfall", "onTreasureSac", "onTargetedBySpell", "returnsToHand", "backup",
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
    return list;
  }
  const KEYWORD_TRIGGERS = {
    // CR 702.108a: whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn
    prowess: { on: "cast", filter: { noncreature: true, controller: "you" }, effect: { pump: [1, 1], self: true } },
    // CR 702.83a: whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn
    exalted: { on: "attacksAlone", filter: { controller: "you" }, effect: { pump: [1, 1], to: "eventObject" } },
    // CR 702.91a: whenever this creature attacks, each other attacking creature gets +1/+0 until end of turn
    "battle cry": { on: "attacks", self: true, effect: { team: { pump: [1, 0], filter: { attacking: true }, other: true } } },
    // CR 702.163a: when this Equipment enters, create a 2/2 red Rebel creature token, then attach this Equipment to it
    "for mirrodin!": { on: "enters", self: true, effect: { forMirrodin: true } }
  };
  // Speed: the events anything in this puzzle can trigger on, worked out when the puzzle loads (its cards are known)
  // and kept up to date as new objects appear (tokens) or keywords are gained; emit() skips all other events
  function listen(s, card) {
    const add = (on) => { if (!s.listens.includes(on)) s.listens.push(on); };
    // a card that targets, counters or copies spells makes the stack itself matter (turns off a solver shortcut)
    const json = JSON.stringify(card);
    if (card.replacements) s.replaces = true;                 // (zone changes then check for replacement effects)
    if (card.conditional || card.perCounter) s.dynamicStatics = true;
    if (/"damageSources"|"attackedCount"/.test(json)) s.tracksSources = true;
    if (/"loseAll"|"setBase"/.test(json)) s.tsMatters = true;  // (effects whose order matters: keep timestamps)
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
    return { effect: d.effect, targets: d.targets, filter: d.targetFilter, count: d.count, if: d.if };
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
    ...(c.toSolve && !(c.st && c.st.lost) ? [CASE_TRIGGER] : [])];
  // CR 719.3a: "To solve — [condition]" means "At the beginning of your end step, if [condition] and this Case is not
  // solved, this Case becomes solved." (c.toSolve: the condition, read by conditionHolds)
  const CASE_TRIGGER = { on: "endStep", filter: { controller: "you" }, if: { toSolve: true }, effect: { solve: true, self: true } };
  // CR 310.12b: a Siege's intrinsic "When the last defense counter is removed from this permanent, exile it, then you may
  // cast it transformed without paying its mana cost."
  const SIEGE_TRIGGER = { on: "defeated", self: true, effect: { siegeDefeated: true } };

  // The objects whose abilities can trigger now: permanents on the battlefield, plus cards in other zones whose
  // triggers say they function there (CR 113.6b). `battlefield` replaces the battlefield part for look-back events.
  const battlefieldNow = (s) => [...s.player.battlefield.map((card) => ({ card, side: "player" })),
    ...s.opponent.battlefield.map((card) => ({ card, side: "opponent" }))];
  function triggerSources(s, battlefield) {
    const out = battlefield || battlefieldNow(s);                     // (zone: battlefield when not given)
    if (!s.offField) return out;                                      // nothing in this puzzle triggers from other zones
    for (const side of ["player", "opponent"]) for (const zone of ["hand", "graveyard", "exile"]) {
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
    if (cond.controls) {
      const n = s[side].battlefield.filter((c) => objectIs(c, cond.controls.filter || {})).length;
      if (n < (cond.controls.min || 1)) return false;
    }
    return true;
  }
  // (descend: the permanent cards — not tokens — in a player's graveyard)
  const permanentCardsIn = (s, side) => s[side].graveyard.filter((c) => isPermanent(faceOf(c, {}))).length;
  const objectIs = (c, f) => (!f.artifact || isArtifact(c)) && (!f.creature || isCreature(c)) && (!f.land || isLand(c)) &&
    (!f.treasure || isTreasure(c)) && (!f.type || hasType(c, f.type));

  // The one place game events go: logged for the UI, and checked against every triggered ability that can
  // function (CR 603.2). Each matching ability triggers once per event (CR 603.2c) and waits in s.triggered
  // until a player would receive priority (CR 603.3).
  function emit(s, e, ev, lookBack) {
    ev.push({ type: "event:" + e.type, id: e.obj && e.obj.id, side: e.side });
    if (!s.listens.includes(e.type)) return;                  // nothing in this puzzle triggers on it (see listen)
    if (e.type === "enters") refresh(s);                       // (its power as it is on the battlefield, for "power 2 or less")
    for (const { card, side, zone } of triggerSources(s, lookBack)) {
      for (const t of triggersOf(card)) {
        if (!eventMatches(t, card, side, e)) continue;
        if (t.if && !conditionHolds(s, t.if, side, card)) continue;        // CR 603.4: checked as it triggers
        // a source that already left (a look-back trigger, like a dying Blood Artist's): keep its last known information
        if ((zone || "battlefield") === "battlefield" && !find(s, card.id)) (s.lki = s.lki || {})[card.id] = lastKnown(card);
        s.triggered.push({ side, name: card.name, srcId: card.id, td: defId(t), ...(zone && zone !== "battlefield" ? { zone } : {}),
          event: { id: e.obj && e.obj.id, side: e.side, controller: e.controller } });
      }
    }
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
    if (kind === "opponent") return [side === "player" ? "opp" : "you"];
    const all = [...s.player.battlefield, ...s.opponent.battlefield].filter(isCreature);
    const creatures = (kind === "opponent-creature" ? s[side === "player" ? "opponent" : "player"].battlefield.filter(isCreature) : all)
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
    if (kind === "creature" || kind === "opponent-creature") return creatures;
    if (kind === "player") return ["opp", "you"];
    // planeswalkers (not also creatures): "any target" (CR 115.4) and "target creature or planeswalker"
    const walkers = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => isPlaneswalker(c) && !isCreature(c))
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id)).map((c) => c.id);
    if (kind === "creature-or-planeswalker") return [...creatures, ...walkers];
    // battles (not also creatures): "any target" includes them (CR 115.4); "target creature, planeswalker, or battle";
    // "target battle or opponent"
    const battles = [...s.player.battlefield, ...s.opponent.battlefield].filter((c) => isBattle(c) && !isCreature(c))
      .filter((c) => matches(s, c, filter, side) && canTarget(s, src, side, c.id) && c.id !== src.id).map((c) => c.id);
    if (kind === "creature-planeswalker-battle") return [...creatures, ...walkers, ...battles];
    if (kind === "battle-or-opponent") return [...battles, side === "player" ? "opp" : "you"];
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
    const ids = crewHelpers(s, vehicle), pw = (id) => Math.max(power(find(s, id)), 0);
    const enough = subsets(ids).filter((l) => l.reduce((t, id) => t + pw(id), 0) >= n);
    if (s.listens.includes("becomesTapped")) return enough;
    return enough.filter((l) => l.every((id) => l.reduce((t, x) => t + pw(x), 0) - pw(id) < n));
  }
  // The payment options for casting f as `a`: convoke helpers (all must help), or any of them when not chosen yet
  // (a permanent sacrificed for bargain can't also be a mana source — a Treasure is sacrificed for its mana)
  const castPayment = (s, f, a, except) =>
    bestPayment(s, reducedCost(s, f, costOf(f, a), a), { except, exclude: a.bargain != null ? [a.bargain] : [], lifePips: has(f, "compleated") ? a.lifePips || 0 : undefined, convoke: has(f, "convoke") ? (a.convoke == null ? "any" : a.convoke) : undefined });

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
    return JSON.parse(json, (k, v) => (v === "X" ? x || 0 : v));
  }

  function relativeTo(to, ctx) {
    if (to === "opp") return ctx.side === "opponent" ? "you" : "opp";
    if (to === "eventObject") return ctx.event && ctx.event.id;
    if (to === "eventController") return ctx.event && ctx.event.controller;
    if (to === "enchanted") return ctx.src && ctx.src.attachedTo;      // "enchanted creature" (an Aura's own trigger)
    return to;
  }

  // ctx: { src (the card the effect comes from, as it was), side, sacPower, selfId, x, event (what triggered it) }
  const GLOBAL = ["damageAll", "destroyAll", "untapAll", "proliferate", "scry", "surveil"];
  function applyEffect(s, eff, target, ctx, ev) {
    if (!eff) return;
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
      if (x && y) {
        const px = Math.max(power(x), 0), py = Math.max(power(y), 0);
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
        if (eff.reanimate) { card.sick = true; card.owner = "player"; ev.push({ type: "reanimated", id }); enter(s, card, { side: "player" }, ev); }
        else s.player.hand.push(card);
      });
      return;
    }
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
    // eff.to: "opp" is "each opponent" of the ability's controller; "eventObject" / "eventController" are the object
    // and player of the event that triggered it ("that creature", "that spell's controller")
    const to = eff.self ? ctx.selfId : eff.to ? relativeTo(eff.to, ctx) : target;
    const isPlayer = to === "opp" || to === "you";
    const tgt = to && !isPlayer ? find(s, to) : null;
    if (to && !isPlayer && !tgt) return;                         // its target is gone: it does nothing
    // damage "equal to the sacrificed creature's power", or "equal to its power": the source as it is now, or as it
    // last existed if it has left (CR 608.2h)
    const srcPower = () => { const now = ctx.selfId && find(s, ctx.selfId); return Math.max(now ? power(now) : ctx.src.lastPower ?? power(ctx.src), 0); };
    if (eff.damage != null) dealDamage(s, ctx.src, ctx.side, to, eff.damage === "sacrificed" ? ctx.sacPower : eff.damage === "power" ? srcPower() : eff.damage, ev);
    if (eff.lifeLoss && isPlayer) changeLife(s, to, -eff.lifeLoss, ev);
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
    if (eff.gainLife) changeLife(s, ctx.side === "player" ? "you" : "opp", eff.gainLife, ev);
    if (eff.controllerLoses && tgt) changeLife(s, sideOf(s, tgt) === "player" ? "you" : "opp", -eff.controllerLoses, ev);   // before it leaves
    if (eff.destroy && tgt && !indestructible(tgt)) leave(s, tgt, "graveyard", ev);
    if (eff.exile && tgt) leave(s, tgt, "exile", ev);
    if (eff.bounce && tgt) leave(s, tgt, "hand", ev);
    if (eff.sacrifice && tgt) leave(s, tgt, "graveyard", ev, { sacrificed: true });   // "sacrifice it" (e.g. Ball Lightning)
    if (eff.counters && tgt) {                                   // e.g. { "+1/+1": 1 }; opposite counters then cancel (SBA)
      tgt.counters = { ...(tgt.counters || {}) };
      Object.entries(eff.counters).forEach(([type, n]) => { tgt.counters[type] = (tgt.counters[type] || 0) + n; });
      ev.push({ type: "counters", id: tgt.id, counters: eff.counters });
    }
    // "-5/-5 … Descend 4 — -10/-10 instead if there are four or more permanent cards in your graveyard"
    const descended = eff.pumpIfDescend && permanentCardsIn(s, ctx.side) >= eff.pumpIfDescend.n;
    if (eff.pump && tgt) addMod(s, tgt, descended ? eff.pumpIfDescend.pump : eff.pump);
    // "it fights up to one target creature you don't control" (CR 701.14a: each deals damage equal to its power to the other)
    if (eff.fightSelf && tgt) {
      const me = find(s, ctx.selfId);
      if (me && isCreature(me)) {
        const pm = Math.max(power(me), 0), pt = Math.max(power(tgt), 0);
        dealDamage(s, me, sideOf(s, me), tgt.id, pm, ev);
        dealDamage(s, tgt, sideOf(s, tgt), me.id, pt, ev);
      }
    }
    if (eff.doublePower && tgt) addMod(s, tgt, [power(tgt), 0]);   // "double its power": +X/+0, X its power (CR 701.10b-c)
    // "double the number of +1/+1 counters on it": as many more as it has (CR 701.10e)
    if (eff.doubleCounters && tgt) {
      const n = (tgt.counters || {})[eff.doubleCounters] || 0;
      if (n) { tgt.counters = { ...tgt.counters, [eff.doubleCounters]: 2 * n }; ev.push({ type: "counters", id: tgt.id, counters: { [eff.doubleCounters]: n } }); }
    }
    // "… and each battle they protect": the battles the opponent protects are your Sieges (CR 310.9e)
    if (eff.damageProtectedBattles) s.player.battlefield.filter(isBattle).forEach((b) => dealDamage(s, ctx.src, ctx.side, b.id, eff.damageProtectedBattles, ev));
    // "loses all abilities" (layer 6) and "has base power and toughness N/N" (layer 7b) until end of turn
    if (eff.loseAll && tgt) addEffect(s, tgt, { loseAll: true });
    if (eff.setBase && tgt) addEffect(s, tgt, { setBase: eff.setBase });
    if (eff.becomeCreature && tgt) addEffect(s, tgt, { becomeCreature: true });   // until end of turn (crew)
    if (eff.grant && tgt) grant(tgt, eff.grant, s);
    if (eff.tap && tgt) tap(s, tgt, ev);
    if (eff.transform && tgt) transform(s, tgt, ev);            // "transform this creature" (CR 701.27)
    // "create a token that's a copy of target creature you control, except it has haste and …" (CR 707.2, 707.9a)
    if (eff.createCopy && tgt) createToken(s, copyValues(tgt, eff.createCopy.except), ctx.side, ev);
    // "you may copy it" (the spell that triggered this): a choice, then a copy on the stack (CR 707.10)
    if (eff.copyEventSpell) {
      const item = s.stack.find((x) => x.kind === "spell" && x.id === (ctx.event && ctx.event.id));
      if (item && choose(s, `Copy ${item.name}?`, ["Copy it", "Don't copy it"], ctx.side) === 0) {
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
    if (eff.draw) draw(s, ctx.side, eff.draw, ev);
    if (eff.create) {
      // "create …" makes tokens for the ability's controller; "target player creates …" (eff.forTarget) for that player
      const side = eff.forTarget ? (to === "you" ? "player" : "opponent") : ctx.side;
      for (let i = 0; i < (eff.create.count || 1); i++) createToken(s, eff.create, side, ev);
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
        if (back && choose(s, `Cast ${back.name} (${card.name} transformed) for free?`, ["Cast it", "Don't cast it"], ctx.side) === 0) {
          s[owner].exile = s[owner].exile.filter((x) => x !== card);
          const a = { type: "cast", id: card.id, face: 1 };
          const f = faceOf(card, a);
          s.stack.unshift({ kind: "spell", name: f.name, id: card.id, a, card });
          ev.push({ type: "cast", id: card.id });
          emit(s, { type: "cast", obj: f, side: ctx.side, targetCount: 0 }, ev);
        }
      }
    }
    // CR 702.165a: backup N — N +1/+1 counters on the target; if that's another creature, it also gains this
    // creature's abilities printed below backup until end of turn (eff.backup.grant)
    if (eff.backup && tgt) {
      tgt.counters = { ...(tgt.counters || {}), "+1/+1": ((tgt.counters || {})["+1/+1"] || 0) + eff.backup.n };
      ev.push({ type: "counters", id: tgt.id, counters: { "+1/+1": eff.backup.n } });
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
      const pick = choose(s, `Tap or untap ${tgt.name}?`, ["Tap it", "Untap it", "Neither"], ctx.side);
      if (pick === 0) tap(s, tgt, ev); else if (pick === 1) untap(s, tgt, ev);
    }
    // CR 719.3a-b: this Case becomes solved
    if (eff.solve && tgt) { tgt.solved = true; changed(s); ev.push({ type: "solved", id: tgt.id }); }
    // "Exile the top N cards of your library. Choose one of them. You may play that card this turn." (unknown cards
    // can't be used: only a known card can be chosen)
    if (eff.impulse) impulse(s, eff.impulse, ctx.side, ev);
    if (eff.map) for (let i = 0; i < eff.map; i++) createToken(s, MAP, ctx.side, ev);          // "create a Map token"
    // "(you may) mill N": the top N cards of your library into your graveyard (CR 701.17a)
    if (eff.mill && (!eff.mayMill || choose(s, `Mill ${eff.mill}?`, [`Mill ${eff.mill}`, "Don't mill"], ctx.side) === 0)) {
      const z = s[ctx.side];
      for (let i = 0; i < eff.mill; i++) {
        const top = z.library.shift() || (!(z.libraryCount > 0) ? z.libraryBottom.shift() : null);
        if (top) putCard(s, top, ctx.side, "graveyard");
        else if (z.libraryCount > 0) z.libraryCount--;              // (an unknown card: irrelevant to the puzzle)
      }
      ev.push({ type: "mill", side: ctx.side, n: eff.mill });
    }
    // "it explores" / "target creature you control explores" (eff.explore: how many times)
    if (eff.explore && tgt) for (let i = 0; i < eff.explore; i++) explore(s, tgt.id, sideOf(s, tgt) || ctx.side, ev);
    if (eff.discover) discover(s, eff.discover, ctx.side, ev);
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
      const n = eff.incubate === "power" ? srcPower() : eff.incubate;
      createToken(s, { ...INCUBATOR, counters: n ? { "+1/+1": n } : undefined }, ctx.side, ev);
    }
    if (eff.forMirrodin) {
      const rebel = createToken(s, { name: "Rebel", type: "Token Creature — Rebel", pt: "2/2", colors: ["R"] }, ctx.side, ev);
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
      s[ctx.side].battlefield.filter(isCreature).filter((c) => matches(s, c, eff.team.filter, ctx.side) && !(eff.team.other && c.id === ctx.selfId)).forEach((c) => {
        if (eff.team.pump) addMod(s, c, eff.team.pump);
        if (eff.team.grant) grant(c, eff.team.grant, s);
      });
    }
  }

  // Sweepers and other effects on many things: { damageAll: { n, creatures: "all"|"opponent"|"yours", players:
  // "opp"|"each" }, destroyAll: { creatures }, untapAll: { creatures }, scry: n, surveil: n }
  function applyGlobal(s, eff, ctx, ev, then) {
    const pick = (who) => (who === "opponent" ? s.opponent.battlefield : who === "yours" ? s.player.battlefield
      : [...s.player.battlefield, ...s.opponent.battlefield]).filter(isCreature);
    if (eff.damageAll) {
      const d = eff.damageAll;
      if (d.creatures) pick(d.creatures).forEach((c) => dealDamage(s, ctx.src, ctx.side, c.id, d.n, ev));
      if (d.players === "opp" || d.players === "each") dealDamage(s, ctx.src, ctx.side, "opp", d.n, ev);
      if (d.players === "each") dealDamage(s, ctx.src, ctx.side, "you", d.n, ev);
    }
    if (eff.destroyAll) {                                       // destroyed at the same time: one look-back (CR 603.10a)
      const before = battlefieldNow(s);
      pick(eff.destroyAll.creatures).filter((c) => !indestructible(c)).forEach((c) => leave(s, c, "graveyard", ev, { lookBack: before }));
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
        if (choose(s, `Proliferate: ${c.name} (${kinds.map((k) => `${c.counters[k]} ${k}`).join(", ")})?`, ["Add one", "Skip"], ctx.side) !== 0) return;
        c.counters = { ...c.counters };
        kinds.forEach((k) => { c.counters[k] += 1; });
        changed(s);
        ev.push({ type: "counters", id: c.id, counters: Object.fromEntries(kinds.map((k) => [k, 1])) });
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
      if (me) { me.counters = { ...(me.counters || {}), "+1/+1": ((me.counters || {})["+1/+1"] || 0) + 1 }; ev.push({ type: "counters", id: me.id, counters: { "+1/+1": 1 } }); }
      if (top && choose(s, `Explore: put ${top.name} into your graveyard?`, ["Leave it on top", "Into the graveyard"], side) === 1) {
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
    if (!found) { ev.push({ type: "discover-nothing" }); return; }
    const f = faceOf(found, {});
    const parts = isPermanent(f) && !f.aura ? [{}] : plan(f, {});
    const p = parts[0] || {};
    // (spells with modes, several targets or divided damage can only be put into your hand here)
    const simple = parts.length === 1 && !f.modes && f.divided == null && !p.slots && !parseCost(f.cost).x && !f.aura;
    const targets = simple && p.targets ? targetsFor(s, f, p.targets, p.filter, side) : null;
    const casts = !simple ? [] : targets ? targets.map((t) => ({ target: t, label: `Cast it → ${nameIn(s, t)}` })) : [{ target: undefined, label: "Cast it" }];
    const pick = choose(s, `Discover ${n}: ${found.name}`, [...casts.map((x) => x.label), "Put it into your hand"], side);
    if (pick < casts.length) {
      const a = { type: "cast", id: found.id, target: casts[pick].target };
      s.stack.unshift({ kind: "spell", name: f.name, id: found.id, a, card: found });
      ev.push({ type: "cast", id: found.id, target: a.target });
      emit(s, { type: "cast", obj: f, side, targetCount: a.target != null ? 1 : 0 }, ev);
    } else z.hand.push(found);
    emit(s, { type: "discovers", obj: { id: found.id }, side }, ev);
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
    const pick = choose(s, "Choose the card you may play this turn", known.map((c) => c.name), side);
    known[pick].playable = true;
  }

  // A library is: known cards on top (library), then unknown, irrelevant cards (libraryCount), then known
  // cards put on the bottom (libraryBottom, e.g. by scry). An unknown card can't be used.
  function draw(s, side, n, ev) {
    const z = s[side];
    for (let i = 0; i < n; i++) {
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
  // CR 111.10s: a Map token
  const MAP = { name: "Map", type: "Token Artifact — Map", colors: [],
    abilities: [{ cost: "{1}", tap: true, sacSelf: true, sorcery: true, targets: "creature", filter: { controller: "you" }, effect: { explore: 1 },
      text: "{1}, {T}, Sacrifice: target creature you control explores" }],
    text: "{1}, {T}, Sacrifice this token: Target creature you control explores. Activate only as a sorcery." };
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
  function createToken(s, spec, side, ev) {
    const t = { ...clone(spec), token: true, owner: side, id: `${slug(spec.name)}-t${s.nextId++}` };
    ["count", "attacking"].forEach((k) => delete t[k]);
    if (!isLand(t)) t.sick = !has(t, "haste");
    ev.push({ type: "token", id: t.id });
    enter(s, t, { side }, ev);
    if (spec.attacking && s.combat && side === "player") {
      s.combat.attackers.push(t.id);
      if (s.combat.blocks) { s.combat.blocks[t.id] = []; s.combat.blocked[t.id] = false; }   // after blocks: unblocked
    }
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
      const pick = choose(s, `${perm.name}: enter as a copy of a creature?`, ["Don't copy", ...options.map((c) => `Copy ${c.name}`)], side);
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
    // a number means +1/+1 counters; an object names the kinds ("enters with two oil counters": { oil: 2 })
    if (perm.entersWithCounters) {
      const w = perm.entersWithCounters;
      const kinds = typeof w === "object" ? w : { "+1/+1": w === "X" ? x || 0 : w };
      Object.entries(kinds).forEach(([k, n]) => { if (n) perm.counters = { ...(perm.counters || {}), [k]: ((perm.counters || {})[k] || 0) + n }; });
    }
    perm.ts = stamp(s);                                        // CR 613.7d: a timestamp as it enters the zone
    if (side === "player" && !isLand(perm)) s.celebration = (s.celebration || 0) + 1;   // (for celebration)
    s[side].battlefield.push(perm);
    changed(s);
    emit(s, { type: "enters", obj: perm, side }, ev);
  }

  // Ward N on a permanent of the opponent's: when your spell or ability targets it, ward triggers and
  // counters it unless you pay N. You always pay if you can. Returns false if it was countered.
  function payWard(s, target, ev) {
    for (const id of [].concat(target || [])) {
      const t = id !== "opp" && id !== "you" ? find(s, id) : null;
      const n = t && sideOf(s, t) === "opponent" ? wardOf(t) : 0;
      if (!n) continue;
      const pay = bestPayment(s, `{${n}}`);
      if (!pay) { ev.push({ type: "countered", by: "ward", id: t.id }); return false; }
      spend(s, pay, ev);
    }
    return true;
  }

  // Pay with the chosen sources: floating mana leaves the pool, Treasures are sacrificed, the rest tap.
  // Returns how many Treasures were sacrificed (their triggers resolve after the cost is paid).
  function spend(s, ids, ev) {
    let treasures = 0;
    ids.filter((id) => id.startsWith("pool:")).map((id) => Number(id.slice(5))).sort((x, y) => y - x).forEach((i) => s.pool.splice(i, 1));
    ids.filter((id) => id.startsWith("life:")).forEach(() => changeLife(s, "you", -2, ev));
    // every source this payment taps: those it uses directly, and those whose extra mana it uses ("id+n")
    const tapped = [...new Set(ids.filter((id) => !id.startsWith("pool:") && !id.startsWith("life:")).map((id) => id.split("+")[0]))];
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
          if (p.then) applyEffect(s, p.then.effect, p.then.target, p.then.ctx, ev);
          continue;
        }
        if (orderChoices(s).length) return;                                  // you choose which of yours goes first
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
    const fast = (f) => f && f.cost != null && !isLand(f) && (isInstant(f) || has(f, "flash"));
    // (asked card by card — "could this be cast or activated right now?" — instead of listing every legal move)
    const castNow = (c, zone) => !c.unknown && (c.faces ? (zone === "exile" && c.onAdventure ? [0] : c.faces.map((_, i) => i)) : [undefined])
      .some((face) => fast(faceOf(c, { face })) && !check(s, { type: "cast", id: c.id, face }));
    return s.player.hand.some((c) => castNow(c, "hand")) ||
      s.player.exile.some((c) => (c.onAdventure || c.playable) && castNow(c, "exile")) ||
      s.player.graveyard.some((c) => c.flashback && castNow(c, "graveyard")) ||
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
    // "At the beginning of the end step" triggers (e.g. Ball Lightning's sacrifice) trigger as the end step
    // begins; you can respond to them, so they resolve when you move on from the end step
    if (step === "cleanup") {
      (s.endTriggers || []).forEach((id) => { const c = find(s, id); if (c && sideOf(s, c) === "player") leave(s, c, "graveyard", ev); });
      s.endTriggers = [];
      sba(s, ev);
    }
    if (step === "end") s.endTriggers = s.player.battlefield.filter((c) => c.atEndStep === "sacrifice").map((c) => c.id);
    s.phase = step;
    // "at the beginning of your end step" triggered abilities (a Case's "To solve", CR 719.3a)
    if (step === "end") emit(s, { type: "endStep", side: "player" }, ev);
    if (step === "attackers") s.attacked = true;              // no attackers declared: combat is over
    if (!s.combat) return;
    if (step === "blockers") declareBlocks(s, blocks, ev);
    if (step === "fsdamage" && firstStrikeStepNeeded(s)) { s.combat.fsHappened = true; combatDamage(s, true, ev); }
    if (step === "damage") combatDamage(s, false, ev);
    if (at(step) >= at("main2")) s.combat = null;              // end of combat: creatures leave combat
  }

  /* ---------- activated abilities ---------- */
  // A creature's {T} abilities can't be used while it's summoning sick (unless it has haste); equip is sorcery speed.
  function abilityProblem(s, card, ab, x) {
    // loyalty abilities (CR 606.3): your main phase with an empty stack, one per permanent per turn; a minus cost
    // needs that many loyalty counters (CR 606.6)
    if (ab.loyalty != null) {
      if (!sorceryTime(s)) return "Loyalty abilities only in your main phase, with nothing on the stack.";
      if (card.loyaltyUsed) return `${card.name} has already used a loyalty ability this turn.`;
      if (ab.loyalty < 0 && loyaltyOf(card) < -ab.loyalty) return `${card.name} doesn't have ${-ab.loyalty} loyalty.`;
    }
    if (ab.tap && card.tapped) return `${card.name} is tapped.`;
    if (ab.tap && isCreature(card) && card.sick && !has(card, "haste")) return `${card.name} has summoning sickness.`;
    // "Remove an oil counter from this artifact: …" (a cost: the counters must be there to remove, CR 118.3)
    const rc = ab.removeCounters;
    if (rc && ((card.counters || {})[rc.kind] || 0) < (rc.n || 1)) return `${card.name} doesn't have ${rc.n || 1} ${rc.kind} counter${(rc.n || 1) > 1 ? "s" : ""}.`;
    if (ab.craft && !craftOptions(s, card, ab.craft).length) return `${card.name} has nothing to craft with.`;
    // (tapping creatures to crew isn't a {T} cost: summoning-sick creatures can crew, CR 302.6 only covers {T}/{Q})
    if (ab.crew && crewHelpers(s, card).reduce((t, id) => t + Math.max(power(find(s, id)), 0), 0) < ab.crew) return `Your untapped creatures don't have ${ab.crew} total power to crew it.`;
    if (ab.sorcery && !sorceryTime(s)) return `You can only ${ab.text || "do that"} during your main phase, with nothing on the stack.`;
    if (ab.cost && !bestPayment(s, withX(ab.cost, x), { exclude: ab.tap ? [card.id] : [] })) return "Not enough mana.";
    if (ab.targets && !targetsFor(s, card, ab.targets, ab.filter).filter((t) => !(ab.effect && ab.effect.attach && t === card.attachedTo)).length) return "There's no legal target.";
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

  // Where a card can be cast from: your hand, exile if it went on an Adventure (then only its creature face), or your
  // graveyard if it has flashback (CR 702.34a)
  function castable(s, id) {
    const h = s.player.hand.find((c) => c.id === id);
    if (h) return { card: h, zone: "hand" };
    // (or a card exiled with "you may play that card this turn")
    const e = s.player.exile.find((c) => c.id === id && (c.onAdventure || c.playable));
    if (e) return { card: e, zone: "exile" };
    const g = s.player.graveyard.find((c) => c.id === id && c.flashback);
    return g ? { card: g, zone: "graveyard" } : null;
  }
  // The spell as it's cast from where it is: from the graveyard by flashback, its flashback cost is paid rather than
  // its mana cost (an alternative cost, CR 118.9; plus any other part of the flashback cost, like beholding)
  // Cast face down with disguise (a.faceDown): a 2/2 face-down creature spell with ward {2} that costs {3} (CR 702.168b, 708.4)
  function castFace(from, a) {
    if (a.faceDown) return { ...FACE_DOWN, kw: [...FACE_DOWN.kw], id: from.card.id, owner: from.card.owner, cost: "{3}" };
    const f = faceOf(from.card, a);
    if (from.zone !== "graveyard") return f;
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
      const d = trig(p); return validTargets(a.target, targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count);
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
      if (s.landPlayed) return "You've already played a land this turn.";
      const n = faceOf(card, a).payLifeOrTapped;
      if (n && a.payLife && !canPayLife(s, n)) return `You don't have ${n} life to pay.`;
      return null;
    }
    if (a.type === "cast") {
      const from = castable(s, a.id);
      if (!from || from.card.unknown) return "You can't cast that.";
      if (from.zone === "exile" && from.card.onAdventure && (a.face || 0) !== 0) return "From exile you can only cast its creature.";
      if (a.faceDown && !from.card.disguise) return "Only a card with disguise can be cast face down.";
      if (a.faceDown && from.zone === "graveyard") return "You can't cast it face down from there.";
      if (from.card.layout === "transform" && (a.face || 0) !== 0) return "A transforming card is cast with its front face up (CR 712.11).";
      const f = castFace(from, a);
      if (isLand(f)) return "Play it as a land instead.";
      if (f.cost == null) return "You can't cast that.";
      if (!isInstant(f) && !has(f, "flash") && !sorceryTime(s)) return `You can only cast ${f.name} during your main phase, with nothing on the stack.`;
      const n = f.chooseCount || 1;
      if (f.modes && a.mode != null) {
        const picks = n > 1 ? [].concat(a.mode) : [a.mode];
        if (picks.length !== n || new Set(picks).size !== n || picks.some((m) => !f.modes[m])) return n === 1 ? "Choose a mode." : `Choose ${n} different modes.`;
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
        if (a.behold === undefined && opts.length < n && !f.behold.orPay) return `${f.name} needs ${n > 1 ? n + " " : "a "}${f.behold.type}${n > 1 ? "s" : ""} to behold.`;
        if (a.behold === "pay" && !f.behold.orPay) return `${f.name} needs a ${f.behold.type} to behold.`;
      }
      if (a.convoke != null) {
        const ok = has(f, "convoke") && new Set(a.convoke).size === a.convoke.length && a.convoke.every((id) => convokeHelpers(s).includes(id));
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
      if (ab.crew) {
        const crew = a.crew || [];
        if (new Set(crew).size !== crew.length || !crew.every((id) => crewHelpers(s, card).includes(id))) return "Only your other untapped creatures can crew it.";
        if (crew.reduce((t, id) => t + Math.max(power(find(s, id)), 0), 0) < ab.crew) return `Choose creatures with ${ab.crew} or more total power to crew it.`;
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
      if (!canAttackNow(s)) return s.attacked ? "Attackers have already been declared this turn." : "You can only declare attackers at the start of combat.";
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
      return null;
    }
    if (a.type === "advance") {
      if (s.pending.length && s.pending[0].side === "player") return `Choose a target for ${s.pending[0].name}'s ability first.`;
      // CR 405.5: a step only ends when all players pass with the stack empty
      if (s.stack.length) return `${s.stack[0].name} is still on the stack: let it resolve first.`;
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
    const f = faceOf(card, a);
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
      enter(s, perm, { x: a.x, lifePips: a.lifePips }, ev);
    } else {
      // A spell whose targets have all become illegal doesn't resolve (608.2b); otherwise each part resolves in order
      const targeted = parts.filter((p) => p.targets || p.slots);
      const live = parts.filter((p) => !(p.targets || p.slots) || stillLegal(s, f, p));
      if (targeted.length && !targeted.some((p) => live.includes(p))) ev.push({ type: "fizzled", id: card.id });
      // ("This spell can't be countered": ward's "counter it unless …" can't counter it, so nothing is paid)
      else live.forEach((p) => { if (f.uncounterable || payWard(s, p.target, ev)) applyEffect(s, fillIn(p.effect, { color: a.color, x: a.x }), p.target, { ...ctx, split: p.split }, ev); });
      // an Adventure goes to exile, from where its creature can be cast later
      if (w.copy) ev.push({ type: "copy-gone", id: w.id });     // CR 707.10a: a copy of a spell off the stack ceases to exist
      else if (card.layout === "adventure" && (a.face || 0) === 1) s.player.exile.push({ ...card, onAdventure: true });
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
      s.pending.unshift({ kind: "choice", side: "player", name: e.q.name, labels: e.q.labels, k: e.q.k, replay: { ...a, choices: [...(a.choices || [])] } });
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
      s.landPlayed = true;
      ev.push({ type: "played", id: card.id });
      enter(s, asFace(card, a.face), { payLife: a.payLife }, ev);
    }

    if (a.type === "mana") {
      // {T}, sacrifice: add one mana of any color. A mana ability: no stack, usable whenever you have priority.
      const t = find(s, a.id);
      leave(s, t, "graveyard", ev, { sacrificed: true });
      s.pool.push("*");
      ev.push({ type: "mana", id: a.id });
    }

    if (a.type === "cast") {
      const { card, zone } = castable(s, a.id);
      const f = castFace({ card, zone }, a);
      // Casting (601.2): face, mode, X and targets are chosen, mana abilities are activated, then costs are paid.
      // A sacrificed creature's power is what it was at that moment (triggers from casting resolve later).
      const pay = castPayment(s, f, a, card.id);
      s.player[zone] = s.player[zone].filter((c) => c !== card);
      delete card.playable;
      // collect evidence: the chosen cards go from your graveyard to exile (CR 701.59a); a permanent spell remembers it
      if (a.evidence != null) {
        const ids = [].concat(a.evidence);
        s.player.exile.push(...s.player.graveyard.filter((c) => ids.includes(c.id)));
        s.player.graveyard = s.player.graveyard.filter((c) => !ids.includes(c.id));
        if (isPermanent(f)) card.evidenced = true;
        ev.push({ type: "evidence", ids });
        emit(s, { type: "collectsEvidence", side: "player" }, ev);
      }
      const sac = a.sac != null ? find(s, a.sac) : null;
      const sacPower = sac ? Math.max(power(sac), 0) : 0;
      spend(s, pay, ev);
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
      emit(s, { type: "cast", obj: f, side: "player", targetCount: new Set([a.target].flat(2).filter((x) => x != null)).size }, ev);
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
      s.stack.unshift({ kind: "spell", name: f.name, id: card.id, a, card, sacPower, ...(zone === "graveyard" ? { flashback: true } : {}) });
    }

    if (a.type === "activate") {
      const card = find(s, a.id);
      const ab = abilitiesOf(card)[a.index];
      const pay = ab.cost ? bestPayment(s, withX(ab.cost, a.x), { exclude: ab.tap ? [card.id] : [] }) : [];
      // CR 602.2: the ability goes on the stack, then its costs are paid; it's independent of its source (CR 113.7a)
      const ctx = { src: lastKnown(card), side: "player", sacPower: Math.max(power(card), 0), selfId: card.id, x: a.x };
      spend(s, pay, ev);
      // a special action (CR 116.2b): it happens now, without using the stack
      if (ab.special === "turnFaceUp") { turnFaceUp(s, card, ev); sba(s, ev); settle(s, ev); return { state: s, events: ev }; }
      if (ab.tap) tap(s, card, ev);
      (ab.crew ? a.crew : []).forEach((id) => tap(s, find(s, id), ev));   // the crew cost
      if (ab.craft) {                                                     // the craft cost: exile it and the material
        const mat = find(s, a.craft);
        if (mat) leave(s, mat, "exile", ev);
        else { const g = s.player.graveyard.find((x) => x.id === a.craft); s.player.graveyard = s.player.graveyard.filter((x) => x !== g); s.player.exile.push(g); }
        leave(s, card, "exile", ev);
      }
      // CR 606.4: a loyalty ability's cost puts on or removes loyalty counters
      if (ab.loyalty != null) { card.counters = { ...(card.counters || {}), loyalty: loyaltyOf(card) + ab.loyalty }; card.loyaltyUsed = true; }
      if (ab.removeCounters) {
        const { kind, n = 1 } = ab.removeCounters;
        card.counters = { ...card.counters, [kind]: card.counters[kind] - n };
        if (!card.counters[kind]) delete card.counters[kind];
      }
      if (ab.sacSelf) leave(s, card, "graveyard", ev, { sacrificed: true });
      ev.push({ type: "activate", id: card.id, index: a.index, target: a.target });
      [...new Set([a.target].flat(2))].map((id) => id && find(s, id)).filter(Boolean)
        .forEach((c) => emit(s, { type: "becomesTarget", obj: c, side: sideOf(s, c), by: "ability", controller: "you" }, ev));
      // CR 602.2a: the ability is on the stack (triggers from paying its costs go on top of it)
      s.stack.unshift({ kind: "ability", name: `${card.name}'s ability`, id: card.id, a, ab, ctx });
    }

    if (a.type === "attack") {
      enterStep(s, "attackers", null, ev);
      s.combat = { attackers: [...a.ids], blocks: null, blocked: {}, fsHappened: false, dealtFirst: [], ...(a.at ? { at: { ...a.at } } : {}) };
      if (s.tracksSources) s.attackedCount = a.ids.length;     // ("three or more creatures attacked this turn")
      const attackers = a.ids.map((id) => find(s, id));
      attackers.forEach((c) => { if (!has(c, "vigilance")) tap(s, c, ev); });   // CR 508.1f
      ev.push({ type: "attack", ids: a.ids });
      // CR 508.1m / 508.2: abilities that trigger on attackers being declared trigger now ("whenever this attacks",
      // battle cry; "attacks alone" for exalted, CR 702.83a), and go on the stack in the declare attackers step
      attackers.forEach((c) => emit(s, { type: "attacks", obj: c, side: "player", toBattle: !!(a.at && a.at[c.id] && isBattle(find(s, a.at[c.id]))) }, ev));
      if (attackers.length === 1) emit(s, { type: "attacksAlone", obj: attackers[0], side: "player" }, ev);
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
    const many = (f.chooseCount || 1) > 1;
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
      else { const d = trig(p); targetChoices(targetsFor(s, srcOf(s, p), d.targets, d.filter, p.side), d.count).forEach((target) => out.push({ type: "trigger", target })); }
      return out;
    }
    if (s.stack.length) out.push({ type: "pass" });           // let the top of the stack resolve (CR 117.4)
    const range = (n) => Array.from({ length: Math.max(n, 0) }, (_, i) => i + 1);
    const sources = [...s.player.hand.map((card) => ({ card, zone: "hand" })),
      ...s.player.exile.filter((c) => c.onAdventure || c.playable).map((card) => ({ card, zone: "exile" })),
      ...s.player.graveyard.filter((c) => c.flashback).map((card) => ({ card, zone: "graveyard" }))];
    for (const { card, zone } of sources) {
      if (card.unknown) continue;
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
          ...(f.bargainLess ? bargainOptions(s).map((bargain) => ({ bargain })) : [])];
        if (check(s, { type: "cast", id: card.id, face }) && !reducible.some((r) => !check(s, { type: "cast", id: card.id, face, ...r }))) continue;
        const n = f.chooseCount || 1;
        const modes = f.modes ? (n > 1 ? combinations(f.modes.map((_, i) => i), n) : f.modes.map((_, i) => i)) : [undefined];
        const colors = f.chooseColor ? [..."WUBRG"] : [undefined];
        const xs = parseCost(f.cost).x ? range(manaAvailable(s) - manaValue(f.cost)) : [undefined];
        const sacs = f.sacrifice ? sacrificeOptions(s, f) : [undefined];
        // additional costs: which creature to blight (or not / pay instead), behold (any one Goblin does the same) or pay,
        // and which creatures help pay through convoke
        const blights = f.blight ? [...blightOptions(s), ...(f.blight.optional ? [undefined] : []), ...(f.blight.orPay ? ["pay"] : [])] : [undefined];
        // (beholding only shows cards: any choice of them does the same, so one is enough)
        const bn = f.behold && (f.behold.count || 1), bopts = f.behold ? beholdOptions(s, f) : [];
        const beholds = f.behold ? [...(bopts.length >= bn ? [bn > 1 ? bopts.slice(0, bn) : bopts[0]] : []), ...(f.behold.orPay ? ["pay"] : [])] : [undefined];
        const convokes = has(f, "convoke") ? subsets(convokeHelpers(s)).filter((l) => l.length <= manaValue(f.cost) + (f.behold && f.behold.orPay ? manaValue(f.behold.orPay) : 0)) : [undefined];
        // compleated: how many Phyrexian pips are paid with life (each costs the walker two loyalty)
        const lifePipsList = has(f, "compleated") ? [0, ...range(parseCost(f.cost).pips.filter((p) => /\/P$/.test(p)).length)] : [undefined];
        // bargain: not bargained, or each permanent you could sacrifice for it
        const bargains = f.bargain ? [undefined, ...bargainOptions(s)] : [undefined];
        // collect evidence (optional): not, or each set of graveyard cards that's just enough
        const evidences = f.evidence ? [undefined, ...evidenceOptions(s, f.evidence)] : [undefined];
        for (const mode of modes) for (const color of colors) for (const x of xs) for (const sac of sacs) for (const bargain of bargains) for (const evidence of evidences)
          for (const blight of blights) for (const behold of beholds) for (const convoke of convokes) for (const lifePips of lifePipsList) {
            for (const pick of castTargets(s, f, { mode, x, blight, bargain, evidence }, sac)) {
              const a = { type: "cast", id: card.id, face, mode, color, x, sac, ...pick };
              if (evidence !== undefined) a.evidence = evidence;
              if (blight !== undefined) a.blight = blight;
              if (behold !== undefined) a.behold = behold;
              if (convoke !== undefined) a.convoke = convoke;
              if (lifePips) a.lifePips = lifePips;
              if (bargain !== undefined) a.bargain = bargain;
              if (!check(s, a)) out.push(a);
            }
          }
      }
    }
    for (const card of s.player.battlefield) {
      abilitiesOf(card).forEach((ab, index) => {
        const xs = parseCost(ab.cost).x ? range(manaAvailable(s, ab.tap ? [card.id] : []) - manaValue(ab.cost)) : [undefined];
        xs.forEach((x) => {
          if (abilityProblem(s, card, ab, x)) return;
          // crewing a Vehicle that's already a creature does nothing more (solver: only crews that matter)
          if (ab.crew) { if (!isCreature(card)) crewChoices(s, card, ab.crew).forEach((crew) => out.push({ type: "activate", id: card.id, index, crew })); return; }
          if (ab.craft) { craftOptions(s, card, ab.craft).forEach((m) => out.push({ type: "activate", id: card.id, index, craft: m })); return; }
          const list = ab.targets ? targetsFor(s, card, ab.targets, ab.filter).filter((t) => !(ab.effect && ab.effect.attach && t === card.attachedTo)) : null;
          (list ? targetChoices(list, ab.targetCount) : [undefined]).forEach((target) => out.push({ type: "activate", id: card.id, index, target, x }));
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
  // Can the player still win from here, whatever the opponent blocks?
  function makeSearch() {
    const memo = new Map();
    function canWin(s) {
      if (won(s)) return true;
      if (turnOver(s)) return false;
      const key = JSON.stringify(s);
      if (memo.has(key)) return memo.get(key);
      memo.set(key, false);                                    // guards against cycles
      let r = false;
      for (const a of moves(s)) {
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
    if (a.type === "pass") return `resolve: ${s.stack[0] ? s.stack[0].name : "the stack"}`;
    if (a.type === "choice") return `${s.pending[0].name.replace(/:.*/, "")}: ${s.pending[0].labels[a.pick]}`;
    if (a.type === "order") return `put ${s.pending[a.pick] ? s.pending[a.pick].name : "a"}'s trigger on the stack first`;
    if (a.type === "attack") return `attack with ${a.ids.map((id) => nameOf(s, id) + (a.at && a.at[id] ? ` (→ ${nameOf(s, a.at[id])})` : "")).sort().join(" + ")}`;
    if (a.type === "advance") return a.to === "main2" && (s.phase === "main1" || s.phase === "boc") ? "skip combat" : `go to ${a.to}`;
    if (a.type === "trigger") return `${s.pending[0] ? s.pending[0].name : "trigger"} → ${nameOf(s, a.target)}`;
    if (a.type === "activate") {
      const card = find(s, a.id);
      const ab = card && abilitiesOf(card)[a.index];
      return `activate ${nameOf(s, a.id)}${ab && ab.text ? ` (${ab.text})` : ""}${a.crew ? ` (crewed by ${a.crew.map((id) => nameOf(s, id)).join(" + ")})` : ""}${a.craft ? ` (with ${nameOf(s, a.craft)})` : ""}${a.target ? ` → ${nameOf(s, a.target)}` : ""}`;
    }
    const from = castable(s, a.id);
    const f = from ? castFace(from, a) : null;
    if (a.faceDown) return `cast ${from ? from.card.name : nameOf(s, a.id)} face down`;
    let d = `cast ${f ? f.name : nameOf(s, a.id)}${from && from.zone === "exile" ? " (from exile)" : from && from.zone === "graveyard" ? " (flashback)" : ""}`;
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
    STEPS, at, init, check, apply, won, lost, canPayLife, turnOver, blightOptions, beholdOptions, convokeHelpers, castPayment, CLUE, evidenceOptions,
    hasType, vividCount, colorsOf, subsets, textOf, pendingTrigger, currentPT, isPlaneswalker, loyaltyOf, isBattle, defenseOf, INCUBATOR, FOOD, ROLES, MAP, bargainOptions, legalActions, nextStep, solve, describe, opponentBlocks, blockOptions, nextStop,
    targetsFor, targetChoices, spellSpec, plan, faceOf, compositions, scryChoices, castable, abilitiesOf, sacrificeOptions, canAttackNow, inMain, parseCost, manaValue, manaAvailable,
    abilityProblem, isCreature, isLand, isInstant, isTreasure, has, power, toughness, slug, makeSearch, WORD_OF
  };
})(typeof window !== "undefined" ? window : globalThis);
