/* Card-text reader: turns a Scryfall card into a game card the rules engine can play.
 *
 * Cards in the CARDS catalog keep their hand-written rules. For any other card the oracle text
 * is read line by line into the engine's fields (keywords, spell effects, Auras, Equipment,
 * anthems, enters/attack/dies triggers, activated and mana abilities, modes, X, choose a color).
 * A line it can't read marks the card `unmodeled` (listed in `unread`), so the creator can warn.
 */
(() => {
  "use strict";
  const { CARDS, c } = window.CARD_CATALOG;

  // Keywords the engine plays (lowercase, as on the card)
  const KEYWORDS = ["flying", "reach", "trample", "menace", "haste", "vigilance", "deathtouch", "first strike",
    "double strike", "defender", "lifelink", "prowess", "flash", "indestructible", "hexproof", "shroud", "intimidate",
    "fear", "shadow", "horsemanship", "skulk", "exalted", "battle cry", "wither", "infect", "changeling", "convoke",
    "plainswalk", "islandwalk", "swampwalk", "mountainwalk", "forestwalk"];
  const COLOR = { white: "W", blue: "U", black: "B", red: "R", green: "G" };
  const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const num = (w) => NUM[w.toLowerCase()] || Number(w);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pt = (v) => (/X/.test(v) ? "X" : Number(v));            // "+X" → "X" (filled in when cast)

  // One keyword as the engine names it ("Ward {2}" → "ward 2"), or null if it isn't supported
  function keyword(k) {
    const w = k.trim().toLowerCase().replace(/\.$/, "");
    if (KEYWORDS.includes(w)) return w;
    let m = /^ward \{(\d+)\}$/.exec(w);
    if (m) return `ward ${m[1]}`;
    // Phyrexia: All Will Be One and later: toxic N, For Mirrodin!, crew N, affinity, compleated
    if ((m = /^(toxic|crew) (\d+)$/.exec(w))) return `${m[1]} ${m[2]}`;
    if (["for mirrodin!", "affinity for artifacts", "affinity for equipment", "compleated"].includes(w)) return w;
    if (w === "protection from the chosen color" || w === "protection from the color of your choice") return "protection from {color}";
    m = /^protection from (white|blue|black|red|green|creatures|everything|multicolored|monocolored)$/.exec(w);
    return m ? w : null;
  }
  const keywordList = (text) => text.split(/,\s*(?:and\s+)?|\s+and\s+/).map(keyword);

  // "target nonblack creature an opponent controls" → { kind, filter, count }; "each opponent" → { to }
  function parseTarget(phrase) {
    let t = phrase.trim().toLowerCase().replace(/\.$/, "");
    if (t === "any target") return { kind: "any" };
    if (t === "each opponent") return { to: "opp" };
    if (/^target (player|opponent)( or planeswalker)?$/.test(t)) return { kind: "player" };
    const m = /^(up to )?(one|two|three|four|a|an)?\s*(?:other )?target (.+)$/.exec(t);
    if (!m) return null;
    const n = m[2] ? num(m[2]) : 1;
    const count = { min: m[1] ? 0 : n, max: n };
    let rest = m[3];
    const f = {};
    rest = rest.replace(/ (an opponent controls|you don't control)$/, () => { f.controller = "opponent"; return ""; })
      .replace(/ you control$/, () => { f.controller = "you"; return ""; });
    let w;
    if ((w = / with power (\d+) or less$/.exec(rest))) { f.maxPower = +w[1]; rest = rest.slice(0, w.index); }
    else if ((w = / with power (\d+) or greater$/.exec(rest))) { f.minPower = +w[1]; rest = rest.slice(0, w.index); }
    else if ((w = / with (flying|reach|trample|defender|first strike|deathtouch|lifelink|vigilance|haste|menace)$/.exec(rest))) { f.kw = w[1]; rest = rest.slice(0, w.index); }
    else if ((w = / without (flying|reach|trample|defender|first strike|deathtouch|lifelink|vigilance|haste|menace)$/.exec(rest))) { f.noKw = w[1]; rest = rest.slice(0, w.index); }
    // other kinds of permanents: "target artifact", "target land", "target permanent"
    const other = /^(artifacts?|lands?|permanents?|nonland permanents?)$/.exec(rest);
    if (other) {
      const kind = /^artifact/.test(other[1]) ? "artifact" : /^land/.test(other[1]) ? "land" : "permanent";
      return { kind, filter: Object.keys(f).length ? f : undefined, count: count.min === 1 && count.max === 1 ? undefined : count };
    }
    const nm = /^(.*?)\s*\b(creatures?(?: or planeswalkers?)?|creatures? and\/or planeswalkers?)$/.exec(rest);
    if (!nm) return null;
    let adj = nm[1].trim();
    if (/attacking or blocking/.test(adj)) { f.attackingOrBlocking = true; adj = adj.replace("attacking or blocking", "").trim(); }
    for (const word of adj.split(/\s+/).filter(Boolean)) {
      if (word === "attacking") f.attacking = true;
      else if (word === "blocking") f.blocking = true;
      else if (word === "tapped") f.tapped = true;
      else if (word === "untapped") f.untapped = true;
      else if (word === "artifact") f.artifact = true;
      else if (word === "nonartifact") f.nonArtifact = true;
      else if (COLOR[word]) (f.colors = f.colors || []).push(COLOR[word]);
      else if (/^non(white|blue|black|red|green)$/.test(word)) (f.notColors = f.notColors || []).push(COLOR[word.slice(3)]);
      else return null;
    }
    // "creature or planeswalker" (and "and/or") can target planeswalkers too
    const kind = /planeswalker/.test(nm[2]) ? "creature-or-planeswalker" : "creature";
    return { kind, filter: Object.keys(f).length ? f : undefined, count: count.min === 1 && count.max === 1 ? undefined : count };
  }

  // "white creatures you control" / "other creatures you control" → a team filter
  // ("permanents you control" only matters for its creatures here)
  function parseTeam(subject) {
    const m = /^(other )?(?:(white|blue|black|red|green|nonwhite|nonblue|nonblack|nonred|nongreen) )?(?:creatures|permanents) you control$/i.exec(subject.trim());
    if (!m) return null;
    const filter = {};
    if (m[2] && COLOR[m[2].toLowerCase()]) filter.colors = [COLOR[m[2].toLowerCase()]];
    if (m[2] && /^non/i.test(m[2])) filter.notColors = [COLOR[m[2].toLowerCase().slice(3)]];
    return { other: !!m[1], filter: Object.keys(filter).length ? filter : undefined };
  }

  // A creature token: "create two 1/1 white Soldier creature tokens with flying that are tapped and attacking"
  function parseToken(s) {
    const m = /^create (a|an|one|two|three|four|x) (\d+)\/(\d+) ((?:colorless|white|blue|black|red|green)(?: and (?:white|blue|black|red|green))?) ((?:[a-z]+ )*?)(artifact )?creature tokens?(?: with (.+?))?( that(?:'s| are) tapped and attacking)?$/i.exec(s);
    if (!m) return null;
    const kw = m[7] ? keywordList(m[7]) : [];
    if (kw.includes(null)) return null;
    const types = m[5].trim().split(" ").filter(Boolean).map((x) => x[0].toUpperCase() + x.slice(1));
    const colors = m[4].split(" and ").map((x) => COLOR[x]).filter(Boolean);
    const token = { name: types.join(" ") || "Creature", type: `Token ${m[6] ? "Artifact " : ""}Creature — ${types.join(" ")}`, pt: `${m[2]}/${m[3]}`, colors };
    if (kw.length) token.kw = kw;
    if (m[8]) { token.tapped = true; token.attacking = true; }
    if (m[1].toLowerCase() !== "x") token.count = num(m[1]);
    return token;
  }

  // Read one effect sentence into { effect, targets, filter, count } (or { to }), or null.
  // SELF is the card's own name, "this creature" or "it".
  function readEffect(sentence, name) {
    const SELF = `(?:${esc(name)}|this creature|this spell|this permanent|it)`;
    const s = sentence.trim().replace(/\.$/, "");
    const re = (pattern) => new RegExp("^" + pattern.replace(/SELF/g, SELF) + "$", "i").exec(s);
    const withTarget = (effect, phrase) => {
      const t = parseTarget(phrase);
      if (!t) return null;
      if (t.to) return { effect: { ...effect, to: t.to } };
      return { effect, targets: t.kind, filter: t.filter, count: t.count };
    };
    let m, r;
    if (re(`choose a color`)) return { effect: {}, chooseColor: true };
    // things that don't matter in a one-turn puzzle with irrelevant libraries
    if (re(`(?:they|those creatures|it|that creature) (?:don't|doesn't) untap during (?:its|their) controller's next untap step`)) return { effect: {} };
    if ((m = re(`(scry|surveil) (\\d+)`))) return { effect: { [m[1].toLowerCase()]: Number(m[2]) } };
    if (re(`proliferate`)) return { effect: { proliferate: true } };                      // CR 701.34
    if ((m = re(`incubate (\\d+)`))) return { effect: { incubate: Number(m[1]) } };       // CR 701.53
    // "Create a Monster Role token attached to target creature you control" (CR 111.10j-r)
    if ((m = re(`create an? (Cursed|Monster|Royal|Sorcerer|Wicked|Young Hero) Role token attached to (.+)`))) {
      return /^(it|this creature)$/i.test(m[2]) ? { effect: { role: m[1], self: true } } : withTarget({ role: m[1] }, m[2]);
    }
    if (re(`create a Food token`)) return { effect: { food: 1 } };
    if (re(`create a Map token`)) return { effect: { map: 1 } };
    if ((m = re(`discover (\\d+)`))) return { effect: { discover: Number(m[1]) } };       // CR 701.57
    if (re(`(?:SELF|it) explores`)) return { effect: { explore: 1, self: true } };         // CR 701.44
    if ((m = re(`target creature you control explores(, then it explores again)?`))) return withTarget({ explore: m[1] ? 2 : 1 }, "target creature you control");
    if (re(`transform SELF`)) return { effect: { transform: true, self: true } };          // CR 701.27
    // "Create a token that's a copy of target creature you control[, except it has haste[ and "At the beginning of the
    // end step, sacrifice this token."]]" (CR 707)
    if ((m = re(`create a token that's a copy of target creature you control(?:, except it has (\\w+)( and "At the beginning of the end step, sacrifice this token\\.")?)?`))) {
      const except = { ...(m[1] ? { kw: [m[1].toLowerCase()] } : {}), ...(m[2] ? { atEndStep: "sacrifice" } : {}) };
      return { effect: { createCopy: { except } }, targets: "creature", filter: { controller: "you" } };
    }
    if (re(`(?:they|it) can't be regenerated`)) return { effect: {} };                 // nothing regenerates here
    if (re(`damage can't be prevented this turn`)) return { effect: { noPrevention: true } };
    if ((m = re(`if X is (\\d+) or more, (?:this spell can't be countered and )?the damage can't be prevented`))) return { effect: { noPreventionIfX: Number(m[1]) } };
    if ((m = re(`(?:target player|target opponent|each opponent) discards (a card|two cards|(\\w+) cards)`))) {
      const discard = m[1] === "a card" ? 1 : num(m[1].split(" ")[0]);
      return /^each/i.test(s) ? { effect: { discard } } : { effect: { discard }, targets: "opponent" };
    }
    if ((m = re(`SELF deals X damage divided evenly, rounded down, among any number of targets`))) {
      return { effect: { evenly: true, damage: "X" }, targets: "any", count: { min: 1, max: 5 } };
    }
    // Shatterskull Smashing: divided among up to two creatures and/or planeswalkers, twice X if X is big
    if ((m = re(`SELF deals X damage divided as you choose among up to two target creatures and/or planeswalkers\\. If X is (\\d+) or more, SELF deals twice X damage divided as you choose among them instead`))) {
      return { effect: { divided: true }, targets: "creature-or-planeswalker", count: { min: 1, max: 2 }, divided: "X", dividedTwiceIfX: Number(m[1]) };
    }
    // damage divided among targets
    if ((m = re(`SELF deals (\\d+|X) damage divided as you choose among (one or two targets|one, two, or three targets|two targets|three targets|any number of targets)`))) {
      const max = { "one or two targets": 2, "one, two, or three targets": 3, "two targets": 2, "three targets": 3 }[m[2].toLowerCase()] || 10;
      const min = /^(two|three) targets$/i.test(m[2]) ? max : 1;
      return { effect: { divided: true }, targets: "any", count: { min, max }, divided: pt(m[1]) };
    }
    // fight and bite
    if ((m = re(`target creature you control fights (?:target|another target) creature(?: you don't control| an opponent controls)?`))) {
      return { effect: { fight: true }, slots: [{ targets: "creature", filter: { controller: "you" } }, { targets: "creature", filter: /control/.test(s) ? { controller: "opponent" } : undefined }] };
    }
    if ((m = re(`target creature you control deals damage equal to its power to (?:target|another target) creature(?: or planeswalker)?(?: you don't control| an opponent controls)?`))) {
      return { effect: { bite: true }, slots: [{ targets: "creature", filter: { controller: "you" } }, { targets: "creature", filter: /don't control|opponent controls/.test(s) ? { controller: "opponent" } : undefined }] };
    }
    // sweepers and other effects on everything
    if ((m = re(`SELF deals (\\d+) damage to each creature( and each player| and each opponent)?`))) {
      return { effect: { damageAll: { n: Number(m[1]), creatures: "all", players: m[2] ? (/player/.test(m[2]) ? "each" : "opp") : undefined } } };
    }
    if ((m = re(`SELF deals (\\d+) damage to each creature your opponents control`))) return { effect: { damageAll: { n: Number(m[1]), creatures: "opponent" } } };
    if ((m = re(`SELF deals (\\d+) damage to each opponent and each creature (?:they control|your opponents control)`))) {
      return { effect: { damageAll: { n: Number(m[1]), creatures: "opponent", players: "opp" } } };
    }
    if ((m = re(`destroy all creatures( your opponents control| you don't control)?`))) return { effect: { destroyAll: { creatures: m[1] ? "opponent" : "all" } } };
    if (re(`untap all creatures you control`)) return { effect: { untapAll: { creatures: "yours" } } };
    // creature cards from your graveyard
    if ((m = re(`return target creature card from your graveyard to (the battlefield|your hand)`))) {
      return { effect: /battlefield/.test(m[1]) ? { reanimate: true } : { regrow: true }, targets: "graveyard-creature" };
    }
    if ((m = re(`SELF deals damage equal to the sacrificed creature's power to (.+)`)) && (r = withTarget({ damage: "sacrificed" }, m[1]))) return r;
    if (re(`gain control of target creature until end of turn\\. untap that creature\\. it gains haste until end of turn`) ||
        re(`untap target creature and gain control of it until end of turn\\. that creature gains haste until end of turn`)) {
      return { effect: { steal: true }, targets: "creature" };
    }
    if ((m = re(`SELF deals (\\d+|X) damage to (.+?)(?: and you gain (\\d+) life)?`)) &&
        (r = withTarget({ damage: pt(m[1]), ...(m[3] ? { gainLife: Number(m[3]) } : {}) }, m[2]))) return r;
    if ((m = re(`destroy (.+)`)) && (r = withTarget({ destroy: true }, m[1]))) return r;
    if ((m = re(`exile (.+)`)) && (r = withTarget({ exile: true }, m[1]))) return r;
    if ((m = re(`return (.+?) to (?:its|their) owner'?s'? hands?`)) && (r = withTarget({ bounce: true }, m[1]))) return r;
    if ((m = re(`(?:its|that creature's) controller loses (\\d+) life`))) return { effect: { controllerLoses: Number(m[1]) } };
    if ((m = re(`(tap|untap) (.+)`)) && (r = withTarget({ [m[1].toLowerCase()]: true }, m[2]))) return r;
    if ((m = re(`(.+?) (?:can't|cannot) block this turn`)) && (r = withTarget({ grant: ["can't block"] }, m[1]))) return r;
    if ((m = re(`(.+?) gets? ([+-](?:\\d+|X))/([+-](?:\\d+|X))(?: and gains? (.+?))? until end of turn`))) {
      const grant = m[4] ? keywordList(m[4]) : [];
      if (grant.includes(null)) return null;
      const effect = { pump: [pt(m[2]), pt(m[3])] };
      if (grant.length) effect.grant = grant;
      if (new RegExp(`^${SELF}$`, "i").test(m[1])) return { effect: { ...effect, self: true } };
      const team = parseTeam(m[1]);
      if (team) return { effect: { team: { ...effect, filter: team.filter } } };
      return withTarget(effect, m[1]);
    }
    if ((m = re(`(.+?) gains? (.+?) until end of turn`))) {
      const grant = keywordList(m[2]);
      if (grant.includes(null)) return null;
      if (new RegExp(`^${SELF}$`, "i").test(m[1])) return { effect: { grant, self: true } };
      const team = parseTeam(m[1]);
      if (team) return { effect: { team: { grant, filter: team.filter } } };
      return withTarget({ grant }, m[1]);
    }
    if ((m = re(`put (a|an|one|two|three|\\d+|X) ([+-]1/[+-]1) counters? on (.+)`))) {
      const effect = { counters: { [m[2]]: m[1] === "X" ? "X" : num(m[1]) } };
      if (new RegExp(`^${SELF}$`, "i").test(m[3])) return { effect: { ...effect, self: true } };
      return withTarget(effect, m[3]);
    }
    if ((m = re(`draw (a card|(\\w+) cards)`))) return { effect: { draw: m[1] === "a card" ? 1 : num(m[2]) } };
    if ((m = re(`(target player|target opponent|each opponent) loses (\\d+|X) life`))) {
      return /^each/i.test(m[1]) ? { effect: { lifeLoss: pt(m[2]), to: "opp" } } : { effect: { lifeLoss: pt(m[2]) }, targets: "player" };
    }
    if ((m = re(`you gain (\\d+|X) life`))) return { effect: { gainLife: pt(m[1]) } };
    if (re(`create a treasure token`)) {
      return { effect: { create: { name: "Treasure", type: "Token Artifact — Treasure", text: "{T}, Sacrifice this artifact: Add one mana of any color." } } };
    }
    const token = parseToken(s);
    if (token) return { effect: { create: token } };
    return null;
  }

  // Several sentences ("Tap target creature. It doesn't untap during its controller's next untap step.") as one
  // effect; they may target at most one kind of thing
  function readEffects(text, name) {
    const whole = readEffect(text, name);                     // Threaten's sentences read as one
    if (whole) return { ...whole, chooseColor: whole.chooseColor || JSON.stringify(whole.effect).includes("{color}") };
    const parts = text.split(/(?<=\.)\s+/).map((x) => readEffect(x, name));
    if (!parts.length || parts.includes(null)) return null;
    const withTargets = parts.filter((p) => p.targets);
    if (new Set(withTargets.map((p) => p.targets)).size > 1) return null;
    const first = withTargets[0] || {};
    if (parts.some((p) => p.slots || p.divided != null)) return null;   // fight/bite/divided only as a whole sentence
    const effect = Object.assign({}, ...parts.map((p) => p.effect));
    return { effect, targets: first.targets, filter: first.filter, count: first.count,
      chooseColor: parts.some((p) => p.chooseColor) || JSON.stringify(effect).includes("{color}") };
  }

  // An activated ability "{1}{R}, {T}: effect" → { cost, tap, sacSelf, targets, filter, targetCount, effect, text },
  // or { mana } for a mana ability
  function readAbility(line, name) {
    const m = /^([^:]+):\s*(.+)$/.exec(line);
    if (!m) return null;
    const SELF = new RegExp(`^sacrifice (?:${esc(name)}|this creature|this artifact|this permanent)$`, "i");
    let cost = "", tap = false, sacSelf = false, removeCounters = null, c2;
    for (const part of m[1].split(/,\s*/)) {
      if (part === "{T}") tap = true;
      else if (/^(\{[0-9WUBRGCX/P]+\})+$/.test(part)) cost += part;
      else if (SELF.test(part)) sacSelf = true;
      // "Remove an oil counter from this artifact" / "Remove two oil counters from it"
      else if ((c2 = new RegExp(`^remove (an?|one|two|three|\\d+) (\\w+) counters? from (?:${esc(name)}|this creature|this artifact|this permanent|it)$`, "i").exec(part))) removeCounters = { kind: c2[2].toLowerCase(), n: num(c2[1]) };
      else return null;
    }
    if (/^add (\{[WUBRGC]\})(?:(?: or |, or |, )\{[WUBRGC]\})*\.?$/i.test(m[2]) && tap && !cost && !sacSelf && !removeCounters) {
      return { mana: [...m[2].matchAll(/\{([WUBRGC])\}/g)].map((x) => x[1]).join("") };
    }
    // "{T}: Add {C}{C}." — several mana of one kind from one tap (Sol Ring)
    const many = /^add ((\{([WUBRGC])\})\2+)\.?$/i.exec(m[2]);
    if (many && tap && !cost && !sacSelf && !removeCounters) return { mana: many[3], amount: many[1].length / 3 };
    const eff = readEffects(m[2], name);
    if (!eff || eff.chooseColor || eff.slots || eff.divided != null) return null;
    const short = m[2].replace(new RegExp(esc(name), "g"), "it").replace(/ until end of turn/i, "").replace(/\.$/, "");
    const ab = { cost, tap, sacSelf, ...(removeCounters ? { removeCounters } : {}), effect: eff.effect, text: `${m[1]}: ${short}` };
    if (eff.targets) { ab.targets = eff.targets; ab.filter = eff.filter; ab.targetCount = eff.count; }
    return ab;
  }

  const setTargets = (obj, eff) => {
    if (!eff.targets) return;
    obj.targets = eff.targets;
    if (eff.filter) obj.targetFilter = eff.filter;
    if (eff.count) obj.targetCount = eff.count;
  };

  // A Scryfall card as a game card. Cards with faces (modal double-faced, split, Adventure, transforming) get each
  // face read on its own; a transforming card starts as its front face.
  function fromScryfall(j) {
    const image = (j.image_uris || (j.card_faces && j.card_faces[0].image_uris) || {}).normal;
    if (CARDS[j.name]) return { ...c(j.name), image };
    // (a double-faced card is "Front // Back" on Scryfall; the catalog knows it by its front face's name)
    const front = j.card_faces && j.card_faces[0] && j.card_faces[0].name;
    if (front && CARDS[front] && CARDS[front].faces) return { ...c(front), image };
    const multi = j.card_faces && ["modal_dfc", "split", "adventure", "transform"].includes(j.layout);
    if (!multi) {
      const face = j.card_faces ? j.card_faces[0] : j;
      const card = readFace(face, j);
      card.name = j.name;
      card.image = image;
      return card;
    }
    const faces = j.card_faces.map((f) => {
      const read = readFace(f, j);
      read.image = (f.image_uris || {}).normal || image;
      return read;
    });
    const front = faces[0];
    // a transforming card is its front face (with both faces kept, to transform into the other; CR 712.8a)
    const card = j.layout === "transform" ? { ...front, layout: j.layout, faces, image }
      : { name: j.name, layout: j.layout, faces, image, type: front.type, cost: front.cost, pt: front.pt, text: j.card_faces.map((f) => f.oracle_text).join("\n//\n") };
    if (j.colors) card.colors = j.colors;
    const unread = faces.flatMap((f) => f.unread || []);
    if (faces.some((f) => f.unmodeled)) { card.unmodeled = true; card.unread = unread; }
    faces.forEach((f) => { delete f.unmodeled; delete f.unread; });
    return card;
  }

  // One face's oracle text read into rules fields
  function readFace(face, j) {
    const name = face.name;
    const text = face.oracle_text || "";
    const card = { name, type: face.type_line || "", cost: face.mana_cost || "", text, kw: [] };
    if (face.loyalty != null || (face === j && j.loyalty != null)) card.loyalty = Number(face.loyalty ?? j.loyalty);   // CR 306.5b
    if (face.colors || j.colors) card.colors = face.colors || j.colors;
    if (face.power != null) card.pt = `${face.power}/${face.toughness}`;
    const isLand = /\bland\b/i.test(card.type) && !/creature/i.test(card.type);
    const isSpell = /instant|sorcery/i.test(card.type);
    const SELF = `(?:${esc(name)}|this creature|this aura|this equipment|this artifact|this land)`;
    const unread = [];
    const lines = text.replace(/\([^)]*\)/g, "").split("\n").map((l) => l.trim()).filter(Boolean);

    // Modal spells: "Choose one —" / "Choose two —" followed by "• mode" lines
    const modal = lines.findIndex((l) => /^choose (one|two|three)\s*[—-]/i.test(l));
    if (modal >= 0 && isSpell) {
      const n = num(/^choose (one|two|three)/i.exec(lines[modal])[1]);
      const modes = lines.slice(modal + 1).filter((l) => l.startsWith("•")).map((l) => l.replace(/^•\s*/, ""));
      const read = modes.map((l) => ({ l, eff: readEffects(l, name) }));
      if (read.length && read.every((x) => x.eff && !x.eff.chooseColor && !x.eff.slots && x.eff.divided == null)) {
        card.modes = read.map(({ l, eff }) => {
          const mode = { text: l.replace(/\.$/, ""), effect: eff.effect };
          setTargets(mode, eff);
          return mode;
        });
        if (n > 1) card.chooseCount = n;
      } else unread.push(...lines.slice(modal));
      lines.splice(modal);
    }

    lines.forEach((line) => {
      let m;
      // "Backup N (reminder)": keyword abilities printed below it are also given to the target (CR 702.165a)
      if ((m = /^Backup (\d+)\b/i.exec(line))) { card.backup = { n: Number(m[1]), grant: [] }; return; }
      // "Bargain" (CR 702.166); what it changes ("if this spell was bargained") isn't read, so such lines stay unread
      if (/^Bargain$/i.test(line)) { card.bargain = true; return; }
      // a line of keywords
      const kws = line.split(/,\s*/).map(keyword);
      if (!kws.includes(null)) { card.kw.push(...kws); if (card.backup) card.backup.grant.push(...kws); return; }
      if (new RegExp(`^${SELF} can't be blocked\\.$`, "i").test(line)) { card.kw.push("unblockable"); return; }
      if (new RegExp(`^${SELF} can't block\\.$`, "i").test(line)) { card.kw.push("can't block"); return; }
      if (new RegExp(`^${SELF} can't attack or block\\.$`, "i").test(line)) { card.kw.push("can't attack", "can't block"); return; }
      // Auras: "Enchant creature", "Enchanted creature gets +2/+0 and has trample." (also lands, artifacts, permanents, players)
      // "Enchant Forest" (a land type), "As this Aura enters, choose a color.", "Enchanted land is the chosen color.",
      // "Whenever enchanted Forest is tapped for mana, its controller adds an additional one mana of the chosen color."
      // copies (CR 707): "You may have this creature enter as a copy of any creature on the battlefield, except it has
      // changeling." and Spinerock Tyrant's "Whenever you cast an instant or sorcery spell with a single target, you may
      // copy it. If you do, those spells gain wither. You may choose new targets for the copy."
      if ((m = new RegExp(`^You may have ${SELF} enter as a copy of any creature on the battlefield(?:, except it has (\\w+))?\\.$`, "i").exec(line))) {
        card.entersAsCopy = { except: m[1] ? { kw: [m[1].toLowerCase()] } : {} };
        return;
      }
      if ((m = /^Whenever you cast an instant or sorcery spell with a single target, you may copy it\.(?: If you do, those spells gain (\w+)\.)? You may choose new targets for the copy\.$/i.exec(line))) {
        card.triggers = [...(card.triggers || []), { on: "cast", filter: { controller: "you", instantOrSorcery: true, singleTarget: true },
          effect: { copyEventSpell: { gain: m[1] ? [m[1].toLowerCase()] : [] } } }];
        return;
      }
      // loyalty abilities: "+1: …", "−2: …", "0: …" (CR 606)
      if ((m = /^([+−-]?)(\d+): (.+)$/.exec(line)) && /planeswalker/i.test(card.type)) {
        const eff = readEffects(m[3], name);
        if (eff && !eff.chooseColor && !eff.slots && eff.divided == null) {
          const ab = { loyalty: (m[1] === "+" || !m[1] ? 1 : -1) * Number(m[2]), effect: eff.effect, text: line.replace(/\.$/, "") };
          if (eff.targets) { ab.targets = eff.targets; ab.filter = eff.filter; ab.targetCount = eff.count; }
          (card.abilities = card.abilities || []).push(ab);
          return;
        }
      }
      // "Flashback {4}{R}" / "Flashback—{1}{R}, Behold three Elementals." (CR 702.34)
      if ((m = /^Flashback[ —]((?:\{[^}]+\})+)\.?$/i.exec(line))) { card.flashback = { cost: m[1] }; return; }
      if ((m = /^Flashback—((?:\{[^}]+\})+), Behold (an?|one|two|three) (\w+?)s?\.?$/i.exec(line))) {
        card.flashback = { cost: m[1], behold: { type: m[3], count: num(m[2]) } };
        return;
      }
      if ((m = /^Enchant (Plains|Island|Swamp|Mountain|Forest)$/.exec(line))) { card.aura = { ...(card.aura || {}), targets: "land", filter: { subtype: m[1] } }; return; }
      if (/^As this Aura enters, choose a color\.$/i.test(line)) { card.chooseColor = true; return; }
      if (/^Enchanted land is the chosen color\.$/i.test(line)) { card.aura = { ...(card.aura || {}), setsColor: true }; return; }
      if (/^Whenever enchanted (land|Plains|Island|Swamp|Mountain|Forest) is tapped for mana, its controller adds an additional one mana of the chosen color\.$/i.test(line)) {
        card.extraMana = true;
        return;
      }
      if ((m = /^Enchant (creature|land|artifact|permanent|player|opponent)( you control| an opponent controls)?$/i.exec(line))) {
        const kind = m[1].toLowerCase();
        card.aura = { ...(card.aura || {}), targets: kind === "opponent" ? "player" : kind };
        if (m[2]) card.aura.filter = { controller: /you/.test(m[2]) ? "you" : "opponent" };
        return;
      }
      // "As an additional cost to cast this spell, sacrifice a creature."
      if (/^As an additional cost to cast this spell, sacrifice a creature\.$/i.test(line)) { card.sacrifice = "creature"; return; }
      if ((m = /^This spell costs \{(\d+)\} more to cast for each target beyond the first\.$/i.exec(line))) { card.extraCostPerTarget = Number(m[1]); return; }
      // Lorwyn Eclipsed additional costs: behold a Goblin or pay {2}; (you may) blight N (or pay {1})
      if ((m = /^As an additional cost to cast this spell, behold an? (\w+) or pay ((?:\{[^}]+\})+)\.$/i.exec(line))) {
        card.behold = { type: m[1], orPay: m[2] };
        return;
      }
      if ((m = /^As an additional cost to cast this spell, (you may )?blight (\d+)(?: or pay ((?:\{[^}]+\})+))?\.$/i.exec(line))) {
        card.blight = { n: Number(m[2]), ...(m[1] ? { optional: true } : {}), ...(m[3] ? { orPay: m[3] } : {}) };
        return;
      }
      // "Cinder Strike deals 2 damage to target creature. It deals 4 damage to that creature instead if this spell's additional cost was paid."
      if (card.blight && (m = /^(.+?\.) It deals (\d+) damage to that (?:creature|permanent) instead if this spell's additional cost was paid\.$/i.exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && eff.effect.damage != null && !eff.slots && eff.divided == null) {
          card.effect = { ...(card.effect || {}), ...eff.effect };
          setTargets(card, eff);
          card.ifBlighted = { effect: { ...card.effect, damage: Number(m[2]) } };
          return;
        }
      }
      // Vivid power (Squawkroaster) and "+2/+0 for each other Goblin you control" (Boneclub Berserker)
      if (new RegExp(`^Vivid — ${SELF}'s power is equal to the number of colors among permanents you control\\.$`, "i").test(line)) { card.vividPower = true; return; }
      if ((m = new RegExp(`^${SELF} gets \\+(\\d+)/\\+(\\d+) for each other (\\w+) you control\\.$`, "i").exec(line))) {
        card.perOther = { type: m[3], pump: [Number(m[1]), Number(m[2])] };
        return;
      }
      // (puzzles are always played on your turn)
      if (new RegExp(`^During your turn, ${SELF} has (.+)\\.$`, "i").test(line)) {
        const kws = keywordList(/has (.+)\.$/.exec(line)[1]);
        if (!kws.includes(null)) { card.kw.push(...kws); return; }
      }
      // entering the battlefield
      if (new RegExp(`^(?:${SELF}|this land) enters(?: the battlefield)? tapped\\.$`, "i").test(line)) { card.entersTapped = true; return; }
      if ((m = new RegExp(`^As (?:${SELF}|this land) enters(?: the battlefield)?, you may pay (\\d+) life\\. If you don't, it enters(?: the battlefield)? tapped\\.$`, "i").exec(line))) {
        card.payLifeOrTapped = Number(m[1]);
        return;
      }
      if ((m = new RegExp(`^${SELF} enters(?: the battlefield)? with (X|a|one|two|three|\\d+) \\+1/\\+1 counters? on it\\.$`, "i").exec(line))) {
        card.entersWithCounters = m[1] === "X" ? "X" : num(m[1]);
        return;
      }
      // named counters: "This artifact enters with two oil counters on it."
      if ((m = new RegExp(`^(?:${SELF}|this artifact|this enchantment) enters(?: the battlefield)? with (a|one|two|three|four|five|\\d+) (\\w+) counters? on it\\.$`, "i").exec(line)) && m[2].toLowerCase() !== "+1/+1") {
        card.entersWithCounters = { [m[2].toLowerCase()]: num(m[1]) };
        return;
      }
      // "This creature gets +1/+1 for each oil counter on it."
      if ((m = new RegExp(`^${SELF} gets \\+(\\d+)/\\+(\\d+) for each (\\w+) counter on it\\.$`, "i").exec(line))) {
        card.perCounter = { kind: m[3].toLowerCase(), pump: [Number(m[1]), Number(m[2])] };
        return;
      }
      // "Corrupted — As long as an opponent has three or more poison counters, this creature gets +2/+0 and has trample."
      if ((m = new RegExp(`^Corrupted — As long as an opponent has three or more poison counters, ${SELF} (?:gets \\+(\\d+)/\\+(\\d+))?(?: and )?(?:has (.+?))?\\.$`, "i").exec(line)) && (m[1] || m[3])) {
        const grant = m[3] ? keywordList(m[3]) : [];
        if (!grant.includes(null)) {
          card.conditional = [...(card.conditional || []), { if: { corrupted: true }, ...(m[1] ? { pump: [Number(m[1]), Number(m[2])] } : {}), ...(grant.length ? { grant } : {}) }];
          return;
        }
      }
      // landfall: "Whenever a land you control enters, this creature gets +2/+2 until end of turn."
      if ((m = new RegExp(`^(?:Landfall — )?Whenever a land (?:you control )?enters(?: the battlefield under your control)?, (.+)$`, "i").exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && !eff.targets && !eff.slots && eff.divided == null) { card.landfall = eff.effect; return; }
      }
      if ((m = new RegExp(`^Whenever ${SELF} becomes the target of a spell, ${SELF} deals (\\d+) damage to that spell's controller\\.$`, "i").exec(line))) {
        card.onTargetedBySpell = Number(m[1]);
        return;
      }
      if ((m = /^(Enchanted|Equipped) creature can't (attack or block|attack|block)\.$/i.exec(line))) {
        const key = /^enchanted/i.test(m[1]) ? "aura" : "equip";
        const grant = m[2] === "attack or block" ? ["can't attack", "can't block"] : [`can't ${m[2]}`];
        card[key] = { ...(card[key] || {}), static: { ...((card[key] || {}).static || {}), grant } };
        return;
      }
      if ((m = /^(Enchanted|Equipped) creature (?:gets ([+-]\d+)\/([+-]\d+)(?: and has (.+?))?|has (.+?))\.$/i.exec(line))) {
        const grant = m[4] || m[5] ? keywordList(m[4] || m[5]) : [];
        if (!grant.includes(null)) {
          const st = {};
          if (m[2]) st.pump = [Number(m[2]), Number(m[3])];
          if (grant.length) st.grant = grant;
          const key = /^enchanted/i.test(m[1]) ? "aura" : "equip";
          card[key] = { ...(card[key] || {}), static: st };
          return;
        }
      }
      if ((m = /^Equip (\{[^}]+\}(?:\{[^}]+\})*)$/i.exec(line))) { card.equip = { ...(card.equip || {}), cost: m[1] }; return; }
      if (new RegExp(`^When ${SELF} is put into a graveyard from the battlefield, return (?:it|${SELF}) to its owner's hand\\.$`, "i").test(line)) {
        card.returnsToHand = true;
        return;
      }
      // anthems: "Creatures you control get +1/+1." (all the time, not "until end of turn")
      if ((m = /^((?:.+ )?creatures you control) get ([+-]\d+)\/([+-]\d+)(?: and have (.+?))?\.$/i.exec(line))) {
        const team = parseTeam(m[1]);
        const grant = m[4] ? keywordList(m[4]) : [];
        if (team && !grant.includes(null)) {
          card.static = { team: { pump: [Number(m[2]), Number(m[3])], ...(grant.length ? { grant } : {}) }, filter: team.filter, other: team.other };
          return;
        }
      }
      // the spell's own effect; each line adds to it, one kind of target at most
      if (isSpell) {
        const eff = readEffects(line, name);
        if (eff && !(eff.targets && card.targets && eff.targets !== card.targets) && !((eff.slots || eff.divided != null) && card.effect)) {
          card.effect = { ...(card.effect || {}), ...eff.effect };
          setTargets(card, eff);
          if (eff.slots) card.slots = eff.slots;
          if (eff.divided != null) card.divided = eff.divided;
          if (eff.dividedTwiceIfX) card.dividedTwiceIfX = eff.dividedTwiceIfX;
          if (eff.chooseColor) card.chooseColor = true;
          return;
        }
      }
      // "When X enters (the battlefield), …"
      if ((m = new RegExp(`^When ${SELF} enters(?: the battlefield)?, (.+)$`, "i").exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && !card.etb && !eff.chooseColor && !eff.slots && eff.divided == null && !(eff.count && eff.count.max > 1)) { card.etb = eff.effect; setTargets(card, eff); return; }
      }
      // "When X dies, …"
      if ((m = new RegExp(`^When ${SELF} dies, (.+)$`, "i").exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && !eff.chooseColor && !eff.slots && eff.divided == null) {
          card.onDeath = { effect: eff.effect };
          if (eff.targets) { card.onDeath.targets = eff.targets; card.onDeath.filter = eff.filter; card.onDeath.count = eff.count; }
          return;
        }
      }
      // "Whenever X attacks, …"
      // "Whenever this creature becomes tapped, …" (CR 603.2e)
      if ((m = new RegExp(`^Whenever ${SELF} becomes tapped, (.+)$`, "i").exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && !eff.chooseColor && !eff.slots && eff.divided == null) {
          card.triggers = [...(card.triggers || []), { on: "becomesTapped", self: true, effect: eff.effect,
            ...(eff.targets ? { targets: eff.targets, targetFilter: eff.filter, count: eff.count } : {}) }];
          return;
        }
      }
      if ((m = new RegExp(`^Whenever ${SELF} attacks, (.+)$`, "i").exec(line))) {
        const eff = readEffects(m[1], name);
        if (eff && !eff.targets && !eff.chooseColor && !eff.slots && eff.divided == null && !eff.effect.scry && !eff.effect.surveil) {   // ("it gets +1/+0" affects itself)
          card.onAttack = eff.effect.create && Object.keys(eff.effect).length === 1 ? { create: eff.effect.create } : { effect: eff.effect };
          return;
        }
      }
      // an activated ability, including "{T}: Add {G}." on lands, creatures and artifacts
      const ab = readAbility(line, name);
      if (ab && ab.mana) { card.produces = (card.produces || "") + ab.mana; if (ab.amount > 1) card.manaAmount = ab.amount; return; }
      if (ab && !isLand) { (card.abilities = card.abilities || []).push(ab); return; }
      unread.push(line);
    });

    if (!card.kw.length) delete card.kw;
    if (card.aura && !card.aura.targets) unread.push("(Aura without an Enchant line)");
    if (card.equip && !card.equip.cost) unread.push("(Equipment without an equip cost)");
    // backup also grants non-keyword abilities printed below it; only keyword ones are read (the rest would be missed)
    if (card.backup && lines.some((l, i) => i > lines.findIndex((x) => /^Backup \d/i.test(x)) && keywordList(l).includes(null)))
      unread.push("(Backup with a non-keyword ability below it)");
    if (unread.length || (card.pt && /\*/.test(card.pt)) || /\{\d\/[WUBRG]\}/.test(card.cost)) {
      card.unmodeled = true;
      card.unread = unread;
    }
    return card;
  }

  window.CardText = { fromScryfall, parseTarget, readEffect };
})();
