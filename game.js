(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const E = window.Engine;
  const HOLD_MS = 260;

  /* ---------- puzzle sets: one category per Magic set, in release order ---------- */
  // Each has 10 puzzles themed on that set's mechanics: 4 easy, 2 medium, 4 hard (a puzzle's tier)
  const SET_LIST = [
    ["one", "Phyrexia: All Will Be One"], ["mom", "March of the Machine"], ["woe", "Wilds of Eldraine"],
    ["lci", "The Lost Caverns of Ixalan"], ["mkm", "Murders at Karlov Manor"], ["otj", "Outlaws of Thunder Junction"],
    ["blb", "Bloomburrow"], ["dsk", "Duskmourn: House of Horror"], ["dft", "Aetherdrift"], ["tdm", "Tarkir: Dragonstorm"],
    ["fin", "Final Fantasy"], ["eoe", "Edge of Eternities"], ["spm", "Marvel's Spider-Man"], ["tla", "Avatar: The Last Airbender"],
    ["ecl", "Lorwyn Eclipsed"], ["tmt", "Teenage Mutant Ninja Turtles"], ["sos", "Secrets of Strixhaven"],
    ["msh", "Marvel Super Heroes"], ["hob", "The Hobbit"], ["fra", "Reality Fracture"]
  ];
  const DIFFS = SET_LIST.map(([id, label]) => ({ id, label, short: id.toUpperCase(), icon: `sets/${id}.svg`, set: true }));
  const TIERS = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const diffOf = (id) => DIFFS.find((d) => d.id === id) || { id, label: id };
  // The set symbol, drawn in the text color (a mask, so it works in light and dark mode)
  const setIcon = (d) => {
    if (!d.icon) return null;
    const i = document.createElement("span");
    i.className = "set-icon";
    i.setAttribute("aria-hidden", "true");
    i.style.setProperty("--icon", `url("${d.icon}")`);
    return i;
  };
  // Each difficulty is its own linear set, in the order listed in puzzles.js
  const setOf = (diff) => window.PUZZLES.filter((p) => p.difficulty === diff);

  /* ---------- progress (per-browser) ---------- */
  // status per puzzle id: "started" < "failed" < "solved" (never downgrades)
  const STORE = "find-lethal:v2";
  const RANK = { started: 1, failed: 2, solved: 3 };

  function readProgress() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved) return saved;
      const old = JSON.parse(localStorage.getItem("find-lethal:v1") || "{}");   // carry over earlier solves
      const out = {};
      Object.keys(old.solved || {}).forEach((id) => (out[id] = "solved"));
      return out;
    } catch (_) { return {}; }
  }
  const progress = readProgress();

  function mark(id, status) {
    if (current && current.custom) return;                 // play-testing a created puzzle doesn't count
    if ((RANK[progress[id]] || 0) >= RANK[status]) return;
    progress[id] = status;
    try { localStorage.setItem(STORE, JSON.stringify(progress)); } catch (_) { /* storage unavailable: fine */ }
  }

  // Cheat: tap the "Find Lethal" title 5 times in a row (or open the page with ?unlock) to unlock every puzzle;
  // the same 5 taps lock them again. Kept per browser.
  const CHEAT = "find-lethal:unlock-all";
  let unlockAll = false;
  try {
    if (/[?&]unlock\b/.test(location.search)) localStorage.setItem(CHEAT, "1");
    unlockAll = localStorage.getItem(CHEAT) === "1";
  } catch (_) { /* storage unavailable: no cheat */ }
  let titleTaps = 0, tapTimer = null;
  document.querySelector(".menu-title").addEventListener("click", () => {
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { titleTaps = 0; }, 1500);
    if (++titleTaps < 5) return;
    titleTaps = 0;
    unlockAll = !unlockAll;
    try { if (unlockAll) localStorage.setItem(CHEAT, "1"); else localStorage.removeItem(CHEAT); } catch (_) { /* fine */ }
    alert(unlockAll ? "Cheat on: every puzzle is unlocked." : "Cheat off: puzzles unlock one by one again.");
  });

  const unlocked = (set, i) => unlockAll || i === 0 || progress[set[i - 1].id] === "solved";

  $("clear-progress").addEventListener("click", () => {
    if (!confirm("Clear all puzzle progress? Every puzzle goes back to untried and locked.")) return;
    Object.keys(progress).forEach((id) => delete progress[id]);
    try {
      localStorage.removeItem(STORE);
      localStorage.removeItem("find-lethal:v1");   // or the old save would be migrated back in
    } catch (_) { /* storage unavailable: fine */ }
    showMenu();
  });

  /* ---------- screens: menu → levels → game ---------- */
  let current = null;   // the puzzle definition being played

  function show(screen) {
    document.body.dataset.screen = screen;
    $("zoneview").hidden = true;
    if (screen !== "game") $("stackview").hidden = $("stack-show").hidden = true;   // (the stack popup belongs to a game)
    const back = $("back");
    back.hidden = screen === "menu";
    back.textContent = screen !== "game" ? "← Menu" : current && current.custom ? "← Creator" : "← Puzzles";
    $("sheet").hidden = true;
    window.scrollTo(0, 0);
  }

  function showMenu() {
    $("diff-list").replaceChildren(...DIFFS.map((d) => {
      const set = setOf(d.id);
      const done = set.filter((p) => progress[p.id] === "solved").length;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "diff-btn " + d.id + (d.set ? " set" : "");
      b.disabled = !set.length;
      b.innerHTML = `<span class="dl"></span><span class="dc"></span>`;
      b.querySelector(".dl").textContent = d.label;
      if (d.icon) b.querySelector(".dl").prepend(setIcon(d));
      b.querySelector(".dc").textContent = set.length ? `${done} / ${set.length} solved` : "Coming soon";
      b.onclick = () => showLevels(d.id);
      return b;
    }));
    show("menu");
  }

  const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

  function showLevels(diff) {
    const set = setOf(diff);
    const title = $("levels-title");
    const d = diffOf(diff);
    title.textContent = d.label;
    if (d.icon) title.prepend(setIcon(d));
    title.className = "levels-title " + diff;
    $("grid").replaceChildren(...set.map((p, i) => {
      const open = unlocked(set, i);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile " + (open ? progress[p.id] || "new" : "locked") + (p.tier ? " tier-" + p.tier : "");
      if (open) b.textContent = i + 1; else b.innerHTML = LOCK_SVG;
      b.title = open ? `${p.title}${p.tier ? " (" + TIERS[p.tier] + ")" : ""}` : "Solve the previous puzzle first";
      b.setAttribute("aria-label", `Puzzle ${i + 1}` + (p.tier ? `, ${TIERS[p.tier]}` : "") + (open ? `: ${p.title}` : " (locked)"));
      if (!open) b.setAttribute("aria-disabled", "true");   // still clickable, to show it's locked
      b.onclick = () => (open ? play(p) : refuse(b));
      return b;
    }));
    show("levels");
  }

  // A locked level was clicked: its tile shakes and pulses red
  function refuse(tile) {
    tile.classList.remove("nope");
    void tile.offsetWidth;                                  // restart the animations on repeated clicks
    tile.classList.add("nope");
  }

  function play(def) {
    current = def;
    show("game");
    load();
  }

  // From a puzzle, back goes to its grid, or to the creator when play-testing a created puzzle
  const leaveGame = () => (current.custom ? showCreator() : showLevels(current.difficulty));

  /* ---------- puzzle creator (creator.js) ---------- */
  function showCreator() {
    show("creator");
    if (window.FindLethal.onCreator) window.FindLethal.onCreator();
  }
  $("open-creator").addEventListener("click", showCreator);

  $("back").addEventListener("click", () => {
    if (document.body.dataset.screen === "game") leaveGame();
    else showMenu();
  });

  /* ---------- the puzzle conventions ---------- */
  const RULES = [
    ["Goal", "Win this turn: get your opponent to 0 life or 10 poison counters. The end step still counts."],
    ["Start", "Your first main phase. You haven't played a land yet."],
    ["Your opponent", "Has only what's shown: no hand, no lands. They never act, they only block — always the block that's worst for you. So your line must beat every block."],
    ["Your life", "∞ means it doesn't matter. If a number is shown, reaching 0 loses."],
    ["The board", "Zones that aren't shown are empty. Dice on a card are counters."],
    ["Your library", "Some puzzles put known cards on top (press and hold Library to see them, top first). Drawing them can be part of the line: a creature that draws a card as it enters can draw the Lightning Bolt on top. Cards below those are unknown and can't be used."],
    ["The stack", "Spells and abilities wait on the stack: respond with another one, or press Resolve."]
  ];
  // What creator.js needs from the game
  window.FindLethal = { cardEl: (c) => cardEl(c, { detached: true }), play: (p) => play(p), menu: () => showMenu() };

  $("show-rules").addEventListener("click", () => {
    $("sheet").classList.remove("fail");
    $("sheet").classList.add("long");
    $("sheet-title").textContent = "Puzzle rules";
    $("sheet-body").replaceChildren(...RULES.map(([h, t], i) => {
      const p = document.createElement("div");
      p.style.marginTop = i ? ".9em" : "0";
      p.append(Object.assign(document.createElement("b"), { textContent: h }), document.createElement("br"), t);
      return p;
    }));
    const btn = $("sheet-btn");
    btn.textContent = "Got it"; btn.onclick = () => ($("sheet").hidden = true);
    $("sheet-alt").hidden = true;
    $("sheet").hidden = false;
  });

  /* ---------- card rendering ---------- */
  const scry = (name) =>
    "https://api.scryfall.com/cards/named?format=image&version=normal&exact=" + encodeURIComponent(name);

  function cardEl(c, { zoom = false, detached = false } = {}) {
    const el = document.createElement("div");
    el.className = "card" + (c.tapped && !zoom ? " tapped" : "") + (c.token ? " token" : "") + (c.faceDown ? " facedown" : "");
    el.dataset.id = c.id || "";
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", c.name);

    // Text fallback face (visible until / unless the image loads)
    const face = document.createElement("div");
    face.className = "face";
    face.innerHTML =
      `<div class="n"></div><div class="t"></div><div class="x"></div>` + (c.pt ? `<div class="p"></div>` : "");
    face.querySelector(".n").textContent = c.name;
    face.querySelector(".t").textContent = c.type || "";
    // a face-down card: you may look at your own (CR 708.5), never at the opponent's
    const mine = state && state.player.battlefield.includes(c);
    const turnUp = (h) => (h.disguise ? `: turn it face up for ${h.disguise}.` : c.manifested && /creature/i.test(h.type || "") ? `: turn it face up for ${h.cost}.` : ". It can't be turned face up.");
    face.querySelector(".x").textContent = c.faceDown
      ? (c.manifested ? "A manifested face-down 2/2." : "Ward {2}. A face-down 2/2.") + (mine && c.hidden ? ` It's your ${c.hidden.name}${turnUp(c.hidden)}` : "")
      : E.textOf(c);
    if (c.pt) face.querySelector(".p").textContent = c.pt;
    el.appendChild(face);

    // Counters sit on the card as dice (like printed puzzles), so they read differently from
    // this-turn pumps: one die per counter type showing how many, green +1/+1, red -1/-1
    const counters = Object.entries(c.counters || {}).filter(([, n]) => n > 0);
    if (counters.length) {
      const dice = document.createElement("div");
      dice.className = "dice";
      counters.forEach(([type, n]) => {
        const d = document.createElement("div");
        d.className = "die " + (type === "-1/-1" ? "minus" : "plus");
        d.dataset.key = `${c.id}|${type}|${n}`;
        d.title = `${n} ${type} counter${n > 1 ? "s" : ""}`;
        d.innerHTML = `<b></b><small></small>`;
        d.querySelector("b").textContent = n;
        d.querySelector("small").textContent = type;
        dice.appendChild(d);
      });
      el.appendChild(dice);
    }

    // Changes this turn: current power/toughness (counters, pumps, damage, and a "*" worked out from the game, in any
    // zone) and keywords gained. A "*" isn't a number, so its value always shows, styled like a change from 0.
    const [bp, bt] = (c.pt || "0/0").split("/").map((v) => Number(v) || 0);
    const star = /\*/.test(c.pt || "");
    const [p, t] = state && !detached ? E.currentPT(state, c) : [E.power(c), E.toughness(c)];   // (creator cards aren't in a game)
    if (E.isCreature(c) && (c.dmg || counters.length || star || p !== bp || t !== bt)) {
      const b = document.createElement("div");
      b.className = "ptbadge" + (p + t > bp + bt ? " up" : p + t < bp + bt ? " down" : "") + (c.dmg ? " hurt" : "");
      b.textContent = `${p}/${t}` + (c.dmg ? ` (${c.dmg} dmg)` : "");
      el.appendChild(b);
    }
    // (including keywords from Auras, Equipment and anthems)
    const gainedKw = ((c.st && c.st.kw) || []).filter((k) => !(c.kw || []).includes(k));
    if (c.st && c.st.lost) gainedKw.unshift("no abilities");
    // designations: suspected, saddled, a solved Case
    if (c.suspected) gainedKw.unshift("suspected");
    if (c.saddled) gainedKw.unshift("saddled");
    if (c.solved) gainedKw.unshift("solved");
    if (c.levels) gainedKw.unshift(`level ${c.level || 1}`);       // a Class's level
    if (c.exhausted && c.exhausted.length) gainedKw.unshift("exhaust used");   // its exhaust ability was activated
    // a Room: which doors are unlocked
    if (c.layout === "room" && c.unlocked) gainedKw.unshift(...c.faces.map((f, i) => `${f.name}: ${c.unlocked[i] ? "unlocked" : "locked"}`));
    if (gainedKw.length) {
      const k = document.createElement("div");
      k.className = "kwchips";
      k.textContent = [...new Set(gainedKw)].join(" · ");
      el.appendChild(k);
    }

    // An Aura or Equipment says what it's attached to
    if (c.attachedTo && !zoom && state) {
      const host = [...state.player.battlefield, ...state.opponent.battlefield].find((x) => x.id === c.attachedTo);
      if (host) el.appendChild(Object.assign(document.createElement("div"), { className: "attachchip", textContent: `On ${host.name}` }));
    }

    // Activated abilities, one button each (usable on your own permanents), including Equipment's equip
    const abilities = E.abilitiesOf(c);
    if (abilities.length && !zoom) {
      const box = document.createElement("div");
      box.className = "abils";
      abilities.forEach((ab, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "abil";
        b.dataset.index = i;
        b.textContent = ab.text || "Ability";
        b.title = `Activate: ${ab.text || "ability"}`;
        box.appendChild(b);
      });
      el.appendChild(box);
    }

    // Tokens keep the text face: looking them up by name can return an unrelated card
    // (e.g. "Treasure" isn't a unique card name). Give a token an explicit `image` to show art.
    if ((c.token && !c.image) || c.faceDown) return el;          // (a face-down card shows its card back)

    const img = new Image();
    img.alt = "";
    img.draggable = false;
    img.onload = () => { face.remove(); el.prepend(img); };
    // (a transformed double-faced card shows its back face: looked up by the front face's name)
    img.src = c.image || (c.transformed && c.faces ? scry(c.faces[0].name) + "&face=back" : scry(c.name));
    return el;
  }

  /* ---------- turn structure tracker ---------- */
  const PHASES = [
    { name: "Beginning", steps: [["untap", "Untap"], ["upkeep", "Upkeep"], ["draw", "Draw"]] },
    { name: "Main 1", steps: [["main1", "Precombat main"]] },
    { name: "Combat", steps: [["boc", "Beginning of combat"], ["attackers", "Declare attackers"],
      ["blockers", "Declare blockers"], ["fsdamage", "First-strike damage"], ["damage", "Combat damage"], ["eoc", "End of combat"]] },
    { name: "Main 2", steps: [["main2", "Postcombat main"]] },
    { name: "End", steps: [["end", "End step"], ["cleanup", "Cleanup"]] }
  ];

  $("phases").replaceChildren(...PHASES.map((ph) => {
    const g = document.createElement("div");
    g.className = "phase-group";
    g.innerHTML = `<div class="sq-row"></div><small></small>`;
    g.querySelector("small").textContent = ph.name;
    g.querySelector(".sq-row").replaceChildren(...ph.steps.map(([id, label]) => {
      const sq = document.createElement("button");
      sq.type = "button";
      sq.className = "sq";
      sq.dataset.step = id;
      sq.title = label;
      sq.setAttribute("aria-label", label);
      return sq;
    }));
    return g;
  }));

  function showPhase(id) {
    const at = E.at(id);
    document.querySelectorAll("#phases .sq").forEach((sq) => {
      const i = E.at(sq.dataset.step);
      sq.classList.toggle("past", i < at);
      sq.classList.toggle("on", i === at);
      sq.classList.toggle("ahead", i > at);
    });
    document.querySelectorAll("#phases .phase-group").forEach((g) =>
      g.classList.toggle("on", !!g.querySelector(".sq.on")));
    const ph = PHASES.find((p) => p.steps.some(([s]) => s === id));
    const step = ph.steps.find(([s]) => s === id)[1];
    $("phase").textContent = ph.steps.length > 1 ? `${ph.name} · ${step}` : step;
  }

  // Click a later step (or Next phase) to move the turn forward. Reaching the end step ends the attempt.
  function advanceTo(to) {
    if (!to || locked || document.body.dataset.screen !== "game") return;
    if (E.check(state, { type: "advance", to })) return;
    cancelCast();
    clearAttackers();
    setPrompt(current.prompt);
    perform({ type: "advance", to });                     // passing declare blockers: the opponent blocks
  }

  // When nothing is left to do, move the turn on by itself. Combat damage and end of combat
  // go straight to main 2 (the same window for instants); with no legal play left, the turn
  // moves to the next step where something happens. Short pauses keep each step visible.
  let gen = 0;   // bumped on every load, so a pending hop never touches a fresh board
  function autoAdvance() {
    if (locked || casting || state.stack.length) return;      // (the stack waits for you: never pass for you)
    const passive = state.phase === "damage" || state.phase === "eoc";
    const stuck = !E.legalActions(state).length;
    if (!passive && !stuck) return;
    const to = passive ? "main2" : E.nextStop(state);
    const mine = gen;
    locked = true;
    setTimeout(() => {
      if (mine !== gen) return;
      locked = false;
      advanceTo(to);
    }, 700);
  }
  $("phases").addEventListener("click", (e) => {
    const sq = e.target.closest(".sq");
    if (sq) advanceTo(sq.dataset.step);
  });
  $("next-phase").addEventListener("click", () => advanceTo(E.nextStep(state)));

  /* ---------- state ---------- */
  // state = the engine's game state; casting = a spell waiting for its sacrifice and/or target
  let state, selected, locked, casting;

  function load() {
    gen++;
    $("zoneview").hidden = true;
    state = E.init(current);
    mark(current.id, "started");
    selected = new Set();
    locked = false;
    casting = null;
    document.body.classList.remove("targeting");
    render();
    setPrompt(current.prompt);
    $("sheet").hidden = true;
  }

  function render() {
    const p = state;
    const d = $("diff");
    const df = diffOf(current.difficulty);
    d.textContent = df.set ? "" : current.difficulty.replace("-", " ");
    if (df.set) {                                               // (the full name on wide screens, the code on phones)
      d.append(Object.assign(document.createElement("span"), { className: "full", textContent: df.label }),
        Object.assign(document.createElement("span"), { className: "short", textContent: df.short || df.label }));
      if (current.tier) d.append(` · ${TIERS[current.tier]}`);  // the puzzle's tier: easy, medium or hard
      d.title = df.label + (current.tier ? ` · ${TIERS[current.tier]}` : "");
    }
    if (df.icon) d.prepend(setIcon(df));
    d.className = "badge " + (current.tier || current.difficulty);
    $("puzzle-title").textContent = current.custom ? current.title : `#${setOf(current.difficulty).indexOf(current) + 1} · ${current.title}`;

    $("opp-life").querySelector("b").textContent = p.opponent.life;
    $("opp-poison").hidden = !(p.opponent.poison > 0);                // a second way to win: 10 poison counters
    $("opp-poison").querySelector("b").textContent = `${p.opponent.poison || 0}/10`;
    $("opp-library").querySelector("b").textContent = p.opponent.library.length + (p.opponent.libraryCount ?? 0);
    $("opp-hand").querySelector("b").textContent = p.opponent.handCount ?? 0;
    $("opp-gy").querySelector("b").textContent = p.opponent.graveyard.length;
    $("you-life").querySelector("b").textContent = p.player.life ?? "∞";   // not shown = irrelevant
    // speed (CR 702.179): shown once a player has one; 4 is max speed
    [["you-speed", p.player], ["opp-speed", p.opponent]].forEach(([el, z]) => {
      $(el).hidden = z.speed == null;
      $(el).querySelector("b").textContent = z.speed >= 4 ? "4 (max)" : z.speed ?? 0;
    });
    $("you-library").querySelector("b").textContent = p.player.library.length + (p.player.libraryCount ?? 0);
    $("you-gy").querySelector("b").textContent = p.player.graveyard.length;
    $("opp-exile").querySelector("b").textContent = p.opponent.exile.length;
    $("you-exile").querySelector("b").textContent = p.player.exile.length;

    fillLane($("opp-lane"), p.opponent.battlefield);
    fillLane($("you-lane"), p.player.battlefield);
    // your hand, plus Adventure cards waiting in exile (their creature can still be cast)
    const hand = p.player.hand;
    // cards you can cast from elsewhere sit with your hand, marked: on an Adventure (exile), flashback (graveyard)
    const adventures = p.player.exile.filter((c) => c.onAdventure || c.playable || c.plotted);
    const flashbacks = p.player.graveyard.filter((c) => c.flashback);
    fill($("hand"), [...hand, ...adventures, ...flashbacks]);
    const mark = (c, label) => {
      const el = document.querySelector(`#hand .card[data-id="${c.id}"]`);
      if (el) { el.classList.add("adventure"); el.append(Object.assign(document.createElement("div"), { className: "attachchip", textContent: label })); }
    };
    adventures.forEach((c) => mark(c, c.plotted ? (c.plottedNow ? "Plotted (cast it free on a later turn)" : "Plotted: cast it free (main phase)")
      : c.playable ? "Exiled: you may play it this turn" : "On an adventure (exile)"));
    flashbacks.forEach((c) => mark(c, `Flashback ${c.flashback.cost} (graveyard)`));
    $("hand-count").textContent = `${hand.length} card${hand.length === 1 ? "" : "s"} in hand` +
      (adventures.length ? ` · ${adventures.length} on an adventure` : "") + (flashbacks.length ? ` · ${flashbacks.length} with flashback` : "");
    $("hand-wrap").classList.toggle("empty", !hand.length && !adventures.length && !flashbacks.length);
    showPhase(p.phase);
    $("pool").textContent = p.pool.length ? `${p.pool.length} mana floating` : "";
    markCombat();
    popNewCounters();
    fitBoard();
    updateButton();
  }

  // Dice pop in only when a creature gains counters, not on every redraw
  let seenCounters = new Set();
  function popNewCounters() {
    const now = new Set();
    document.querySelectorAll(".lane .die").forEach((d) => {
      now.add(d.dataset.key);
      if (!seenCounters.has(d.dataset.key)) d.classList.add("pop");
    });
    seenCounters = now;
  }

  // Shrink the cards until the board and the peeking hand fit between the top and bottom bars
  // (the CSS size is a good guess, but some screens and boards need a little less)
  function fitBoard() {
    const table = $("table");
    table.style.removeProperty("--cw");
    fitRows();
    const probe = table.querySelector(".row.creatures .card, #hand .card");
    if (!probe) return;
    const overflow = () => {
      const bottom = $("hand-wrap").classList.contains("empty") ? $("you") : $("hand");
      const over = bottom.getBoundingClientRect().bottom - document.querySelector(".bar").getBoundingClientRect().top;
      return over > 12;                                     // the hand tucks .625rem under the bar on purpose
    };
    let cw = probe.offsetWidth;
    for (let i = 0; i < 40 && overflow() && cw > 44; i++) {
      cw -= 3;
      table.style.setProperty("--cw", `${cw}px`);
      fitRows();
    }
  }

  // Rows never wrap (that would make the board taller than the screen). When a row's cards
  // don't fit its width, they overlap evenly instead, like a stack of lands.
  function fitRows() {
    document.querySelectorAll(".lane .row, #hand").forEach((row) => {
      const cards = [...row.children].filter((n) => n.classList.contains("card"));
      cards.forEach((c) => (c.style.marginLeft = ""));
      if (cards.length < 2) return;
      const cs = getComputedStyle(row);
      const gap = parseFloat(cs.columnGap) || 0;
      const avail = row.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const box = (c) => { const s = getComputedStyle(c); return c.offsetWidth + parseFloat(s.marginLeft) + parseFloat(s.marginRight); };
      const total = cards.reduce((n, c) => n + box(c), 0) + gap * (cards.length - 1);
      if (total <= avail) return;
      const overlap = (total - avail + 2) / (cards.length - 1);   // +2: a little slack for rounding
      cards.slice(1).forEach((c) => (c.style.marginLeft = `${parseFloat(getComputedStyle(c).marginLeft) - overlap}px`));
    });
  }
  window.addEventListener("resize", () => { if (state && document.body.dataset.screen === "game") fitBoard(); });

  // Attacking creatures stand forward; blockers say what they block
  function markCombat() {
    const C = state.combat;
    if (!C) return;
    C.attackers.forEach((id) => {
      const n = document.querySelector(`#you-lane .card[data-id="${id}"]`);
      if (n) n.classList.add("in-combat");
    });
    Object.entries(C.blocks || {}).forEach(([aid, bids]) => {
      const a = state.player.battlefield.find((c) => c.id === aid);
      bids.forEach((bid) => {
        const n = document.querySelector(`#opp-lane .card[data-id="${bid}"]`);
        if (!n) return;
        n.classList.add("blocking");
        n.append(Object.assign(document.createElement("div"), { className: "blockchip", textContent: `Blocks ${a ? a.name : "—"}` }));
      });
    });
  }

  function fill(node, cards) {
    node.replaceChildren(...(cards || []).map((c) => cardEl(c)));
  }

  // Battlefield: creatures (and other nonland permanents) on top, lands in a row below
  function fillLane(node, cards) {
    const row = (cls, list) => {
      const r = document.createElement("div");
      r.className = "row " + cls;
      fill(r, list);
      return r;
    };
    node.replaceChildren(row("creatures", cards.filter((c) => !E.isLand(c))), row("lands", cards.filter(E.isLand)));
  }

  function setPrompt(text, bad = false) {
    const el = $("prompt");
    // (back to the puzzle's prompt while something waits on the stack: show the stack instead)
    el.textContent = text === (current && current.prompt) && stackWaits() ? stackPrompt() : text;
    el.classList.toggle("bad", bad);
    renderStack();
  }

  // The main button declares attackers; with something waiting on the stack it lets the top object resolve
  // (you pass priority; the opponent always passes too)
  const stackWaits = () => state && state.stack.length > 0 && !state.pending.length;
  const stackName = (x) => (x.kind === "trigger" ? `${x.name}'s trigger` : x.name);
  function updateButton() {
    const go = $("go");
    renderStack();
    if (stackWaits()) {
      go.textContent = "Resolve";                              // (the prompt lists what's on the stack)
      go.title = `Resolve ${stackName(state.stack[0])}`;
      go.disabled = locked;
      return;
    }
    go.textContent = "Declare attackers";
    go.disabled = locked || selected.size === 0 || !E.canAttackNow(state);
  }
  // The stack popup: what's waiting, as cards (top first), with Resolve; the eye hides it to look at the board or to
  // respond (a small "Stack" button brings it back). It shows again whenever something new goes on the stack.
  let stackHidden = false, stackSeen = 0;
  const idName = (id) => {
    if (id === "opp") return "the opponent";
    if (id === "you") return "you";
    const c = [...state.player.battlefield, ...state.opponent.battlefield, ...state.player.graveyard, ...state.opponent.graveyard,
      ...state.player.exile, ...state.opponent.exile].find((x) => x.id === id);
    return c ? c.name : null;
  };
  function stackSource(x) {
    if (x.kind === "spell" && x.a.faceDown) return { id: x.card.id, name: "Face-down spell", type: "Creature", pt: "2/2", faceDown: true, hidden: x.card };
    if (x.kind === "spell") return x.card.faces ? { ...x.card, ...x.card.faces[x.a.face || 0], id: x.card.id } : x.card;
    // your speed's own trigger has no source (CR 702.179d)
    if (x.kind === "trigger" && x.srcId === "speed") return { id: "speed", name: "Speed", type: "Speed", token: true, colors: [],
      text: "Whenever one or more opponents lose life during your turn, if your speed is less than 4, your speed increases by 1. This ability triggers only once each turn." };
    const id = x.kind === "trigger" ? x.srcId : x.id;
    const here = [...state.player.battlefield, ...state.opponent.battlefield, ...state.player.graveyard, ...state.opponent.graveyard,
      ...state.player.exile, ...state.opponent.exile].find((c) => c.id === id);
    return here || (x.ctx && x.ctx.src) || { id, name: x.name.replace(/'s ability$/, ""), type: "" };
  }
  function renderStack() {
    const view = $("stackview"), pill = $("stack-show");
    if (!state || !stackWaits() || E.won(state)) { stackHidden = false; stackSeen = 0; view.hidden = pill.hidden = true; return; }
    if (state.stack.length > stackSeen) stackHidden = false;
    stackSeen = state.stack.length;
    const visible = !stackHidden && !casting;
    view.hidden = !visible;
    pill.hidden = visible || !!casting;
    pill.textContent = `Show the stack (${state.stack.length})`;
    $("stack-resolve").disabled = locked;
    $("stack-resolve").textContent = `Resolve ${stackName(state.stack[0])}`;
    $("stack-note").textContent = state.stack.length > 1
      ? "The top one resolves first. Press the eye to look at the board or cast a response."
      : "Press the eye to look at the board or cast a response.";
    $("stack-cards").replaceChildren(...state.stack.map((x, i) => {
      const item = document.createElement("div");
      item.className = "stack-item" + (i === 0 ? " top" : "");
      const el = cardEl(stackSource(x), { detached: true });
      el.classList.remove("tapped");
      const kind = x.kind === "trigger" ? "Triggered ability" : x.kind === "ability" ? "Activated ability" : x.copy ? "Copy of a spell" : "Spell";
      const t = x.kind === "trigger" ? x.target : x.a && x.a.target;
      const targets = [].concat(t == null ? [] : t).flat().map(idName).filter(Boolean);
      const b = document.createElement("b"); b.textContent = (i === 0 ? "Top: " : "") + stackName(x);
      const small = document.createElement("small"); small.textContent = kind + (targets.length ? ` → ${targets.join(", ")}` : "");
      item.append(el, b, small);
      return item;
    }));
  }
  $("stack-hide").addEventListener("click", () => { stackHidden = true; renderStack(); });
  $("stack-show").addEventListener("click", () => { stackHidden = false; renderStack(); });
  $("stack-resolve").addEventListener("click", () => $("go").click());

  // "On the stack: Shock (top), Giant Growth": what's waiting, and what you can do about it
  function stackPrompt() {
    const names = state.stack.map((x, i) => (i === 0 ? `${stackName(x)} (top)` : stackName(x))).join(", ");
    return `On the stack: ${names}. Cast a response, or press Resolve.`;
  }

  /* ---------- press-and-hold zoom (mouse + touch) ---------- */
  let holdTimer = null, zooming = false, swallowClick = false, downAt = null;

  function findCard(target) {
    const el = target.closest && target.closest(".card");
    if (!el || el.closest("#zoom") || !state) return null;
    const id = el.dataset.id;
    const all = [].concat(
      state.opponent.battlefield, state.player.battlefield, state.player.hand,
      state.opponent.graveyard, state.player.graveyard, state.opponent.exile, state.player.exile
    );
    return all.find((c) => c.id === id) || null;
  }

  function showZoom(card) {
    const z = $("zoom");
    z.replaceChildren(cardEl(card, { zoom: true }));
    z.classList.add("on");
    zooming = true;
  }
  function hideZoom() {
    clearTimeout(holdTimer);
    holdTimer = null;
    if (zooming) {
      $("zoom").classList.remove("on");
      zooming = false;
      swallowClick = true;                    // the release shouldn't count as a click
      setTimeout(() => (swallowClick = false), 350);
    }
  }

  document.addEventListener("pointerdown", (e) => {
    const c = findCard(e.target);
    if (!c) return;
    downAt = { x: e.clientX, y: e.clientY };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => showZoom(c), HOLD_MS);
  });
  document.addEventListener("pointermove", (e) => {
    if (!holdTimer || !downAt) return;
    if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 14) {   // finger moved: it's a scroll/drag
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  });
  ["pointerup", "pointercancel", "pointerleave", "blur"].forEach((t) =>
    window.addEventListener(t, hideZoom, true)
  );
  document.addEventListener("contextmenu", (e) => { if (findCard(e.target)) e.preventDefault(); });

  /* ---------- graveyard & exile viewers (long press a pile) ---------- */
  const ZONES = {
    "you-gy": ["player", "graveyard", "Your graveyard"], "opp-gy": ["opponent", "graveyard", "Opponent's graveyard"],
    "you-exile": ["player", "exile", "Your exile"], "opp-exile": ["opponent", "exile", "Opponent's exile"],
    "you-library": ["player", "library", "Your library"], "opp-library": ["opponent", "library", "Opponent's library"]
  };
  let pileTimer = null, pileAt = null;
  const cancelPile = () => {
    clearTimeout(pileTimer);
    pileTimer = null;
    document.querySelectorAll(".pile.pressing").forEach((p) => p.classList.remove("pressing"));
  };
  Object.keys(ZONES).forEach((id) => {
    const pile = $(id);
    pile.addEventListener("pointerdown", (e) => {
      if (!state) return;
      pileAt = { x: e.clientX, y: e.clientY };
      cancelPile();
      pile.classList.add("pressing");
      pileTimer = setTimeout(() => { cancelPile(); openZone(id); }, HOLD_MS);
    });
    pile.addEventListener("pointerleave", cancelPile);
    pile.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  ["pointerup", "pointercancel"].forEach((t) => window.addEventListener(t, cancelPile));
  window.addEventListener("pointermove", (e) => {
    if (pileTimer && pileAt && Math.hypot(e.clientX - pileAt.x, e.clientY - pileAt.y) > 14) cancelPile();
  });

  function openZone(id) {
    const [side, zone, title] = ZONES[id];
    const cards = state[side][zone];
    // a library: the cards known to be on top (top first), then however many unknown cards
    const unknown = zone === "library" ? state[side].libraryCount || 0 : 0;
    if (!cards.length && !unknown) return toast(`${{ graveyard: "Graveyard", exile: "Exile", library: "Library" }[zone]} is empty`);
    $("zone-title").textContent = `${title} (${cards.length + unknown})`;
    $("zone-cards").replaceChildren(...cards.map((c) => cardEl(c, { zoom: true })));
    $("zone-note").textContent = zone !== "library" ? "" : (cards.length ? "Top of the library first. " : "") +
      (unknown ? `${cards.length ? "Below them: " : ""}${unknown} unknown card${unknown === 1 ? "" : "s"} (not part of the puzzle: drawn, they can't be used).` : "");
    $("zoneview").hidden = false;
    swallowClick = true;                                    // the release of the long press isn't a click
    setTimeout(() => (swallowClick = false), 350);
  }
  const closeZone = () => { $("zoneview").hidden = true; };
  $("zone-close").addEventListener("click", closeZone);
  $("zoneview").addEventListener("click", (e) => { if (e.target === $("zoneview") && !swallowClick) closeZone(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("zoneview").hidden) closeZone(); });

  // A short message that fades out by itself
  function toast(text) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = text;
    document.body.appendChild(t);
    t.addEventListener("animationend", () => t.remove());
    setTimeout(() => t.remove(), 1800);                     // in case animations are off
  }

  /* ---------- playing cards from hand ---------- */
  function rulesNote(msg, el) {
    setPrompt(msg, true);
    if (el) { el.classList.remove("nope"); void el.offsetWidth; el.classList.add("nope"); }
  }

  const lifeBox = (t) => $(t === "opp" ? "opp-life" : "you-life");
  // (a creature whose enters trigger can target itself is still in hand while you choose)
  const elFor = (id) => (id === "opp" || id === "you" ? lifeBox(id)
    : document.querySelector(`.lane .card[data-id="${id}"]`) || document.querySelector(`#hand .card[data-id="${id}"]`));

  // Highlight what can be picked right now (sacrifice choices, then targets)
  function markChoices(ids) {
    document.querySelectorAll(".targetable").forEach((n) => n.classList.remove("targetable"));
    ids.forEach((id) => { const n = elFor(id); if (n) n.classList.add("targetable"); });
    document.body.classList.toggle("targeting", ids.length > 0);
  }

  $("hand").addEventListener("click", (e) => {
    if (swallowClick || locked) return;
    const el = e.target.closest(".card");
    if (!el) return;
    if (casting && casting.pick) { if (el.classList.contains("targetable")) togglePick(el.dataset.id); return; }   // (behold: reveal it)
    const from = E.castable(state, el.dataset.id);              // your hand, or an Adventure card waiting in exile
    if (!from) return;
    const card = from.card;
    if (casting && casting.card && casting.card.id === card.id) {
      if (el.classList.contains("targetable")) return void choose(card.id);   // targeting itself
      cancelCast(); setPrompt(current.prompt); return;
    }
    if (casting && casting.trigger) return;                   // a trigger or scry is waiting for you
    cancelCast();
    clearAttackers();
    casting = { card, face: from.zone === "exile" && card.onAdventure ? 0 : card.faces ? undefined : null, results: [], picks: [] };
    el.classList.add("selected", "casting");
    nextChoice();
  });

  const ONE = { min: 1, max: 1 };
  const combos = (list, k) => (k === 0 ? [[]] : list.flatMap((x, i) => combos(list.slice(i + 1), k - 1).map((c) => [x, ...c])));
  const faceNow = () => E.faceOf(casting.card, { face: casting.face ?? undefined });
  const faceOk = (card, face) => {
    const f = E.faceOf(card, { face });
    return !E.check(state, E.isLand(f) ? { type: "play", id: card.id, face } : { type: "cast", id: card.id, face });
  };

  // Walk a spell through its choices: face → mode(s) → color → X → sacrifice → targets (in groups) → split → cast.
  // Abilities: X → targets. Waiting triggers: targets.
  function nextChoice() {
    if (casting.trigger) return targetPhase();
    const { card } = casting;
    const again = (key) => (v) => { casting[key] = v; nextChoice(); };
    if (casting.index != null) {
      const ab = E.abilitiesOf(card)[casting.index];
      if (E.parseCost(ab.cost).x && casting.x == null) {
        const max = E.manaAvailable(state, ab.tap ? [card.id] : []) - E.manaValue(ab.cost);
        if (max < 1) { cancelCast(); return rulesNote("Not enough mana."); }
        return askChoice(`${card.name}: choose X`, Array.from({ length: max }, (_, i) => [i + 1, String(i + 1)]), again("x"));
      }
      // crew: tap your other untapped creatures with enough total power (summoning-sick ones too)
      if (ab.crew && casting.crew === undefined) {
        const ids = crewIds(card);
        const pw = (l) => l.reduce((t, id) => t + E.crewPower(state.player.battlefield.find((c) => c.id === id)), 0);
        return pickCards({ ids, min: 1, max: ids.length,
          prompt: ab.saddle ? `Saddle ${ab.crew}: tap your other creatures with ${ab.crew} or more total power to saddle ${card.name}.`
            : `Crew ${ab.crew}: tap your creatures with ${ab.crew} or more total power to make ${card.name} a creature.`,
          confirm: (l) => `${ab.saddle ? "Saddle" : "Crew"} (${pw(l)} power)`, complete: (l) => pw(l) >= ab.crew,
          then: (l) => again("crew")(l) });
      }
      // craft: which permanent or graveyard card to exile with it
      if (ab.craft && casting.craft === undefined) {
        const opts = E.legalActions(state).filter((a) => a.type === "activate" && a.id === card.id && a.index === casting.index && a.craft)
          .map((a) => {
            const onField = state.player.battlefield.find((c) => c.id === a.craft);
            const c = onField || state.player.graveyard.find((x) => x.id === a.craft);
            return [a.craft, `${c ? c.name : a.craft}${onField ? "" : " (graveyard)"}`];
          });
        if (!opts.length) { cancelCast(); return rulesNote(`${card.name} has nothing to craft with.`); }
        return askChoice(`${card.name}: craft with what?`, opts, again("craft"));
      }
      casting.phases = casting.phases ||
        (ab.targets ? [{ kind: ab.targets, filter: ab.filter, count: ab.targetCount || ONE, src: card, label: `${card.name}'s ability` }] : []);
      return targetPhase();
    }
    if (card.faces && casting.face === undefined) {
      const usable = card.faces.map((f, i) => [i, f]).filter(([i]) => faceOk(card, i));
      if (!usable.length) { cancelCast(); return rulesNote(E.check(state, { type: "cast", id: card.id, face: 0 }) || "You can't use that right now."); }
      if (usable.length === 1) casting.face = usable[0][0];
      else return askChoice(`${card.name}: which side?`, usable.map(([i, f]) => [i, E.isLand(f) ? `Play ${f.name} (land)` : `Cast ${f.name}`]), again("face"));
    }
    // disguise: cast it normally, or face down for {3} (a 2/2 with ward {2}: no targets, nothing else to choose)
    if (card.disguise && casting.faceDown === undefined) {
      const down = !E.check(state, { type: "cast", id: card.id, faceDown: true });
      const normal = !E.check(state, { type: "cast", id: card.id });
      if (down && !normal) casting.faceDown = true;
      else if (down) return askChoice(`${card.name}: how do you cast it?`, [[false, `Cast ${card.name} (${card.cost})`], [true, "Cast it face down for {3} (disguise)"]], again("faceDown"));
      else casting.faceDown = false;
    }
    if (casting.faceDown) return finishChoice(undefined);
    // plot (a card in your hand): cast it now, or plot it (exile it for its plot cost; cast it free on a later turn)
    if (card.plot && casting.plot === undefined && state.player.hand.includes(card)) {
      const canPlot = !E.check(state, { type: "plot", id: card.id });
      const canCast = !E.check(state, { type: "cast", id: card.id });
      if (canPlot && canCast) return askChoice(`${card.name}: cast or plot?`, [[false, `Cast ${card.name} (${card.cost})`], [true, `Plot it for ${card.plot}`]], again("plot"));
      casting.plot = canPlot && !canCast;
    }
    if (casting.plot) {
      const a = { type: "plot", id: card.id };
      const why = E.check(state, a);
      cancelCast();
      return why ? rulesNote(why) : perform(a);
    }
    // cycling (a card in your hand): cast it, or cycle it (pay the cycling cost and discard it: draw a card)
    if (card.cycling && casting.cycle === undefined && state.player.hand.includes(card)) {
      const canCycle = !E.check(state, { type: "cycle", id: card.id });
      const canCast = !E.check(state, { type: "cast", id: card.id });
      if (canCycle && canCast) return askChoice(`${card.name}: cast or cycle?`, [[false, `Cast ${card.name} (${card.cost})`], [true, `Cycle it for ${card.cycling} (discard it, draw a card)`]], again("cycle"));
      casting.cycle = canCycle && !canCast;
    }
    if (casting.cycle) {
      const a = { type: "cycle", id: card.id };
      const why = E.check(state, a);
      cancelCast();
      return why ? rulesNote(why) : perform(a);
    }
    const f = faceNow();
    // collect evidence (an optional additional cost): which cards from your graveyard to exile, or none
    if (f.evidence && casting.evidence === undefined) {
      const base0 = { type: "cast", id: card.id, face: casting.face ?? undefined };
      const name = (id) => (state.player.graveyard.find((c) => c.id === id) || {}).name || id;
      const opts = E.evidenceOptions(state, f.evidence).filter((l) => !E.check(state, { ...base0, evidence: l }))
        .map((l) => [l, `Collect evidence: exile ${l.map(name).join(" + ")}`]);
      if (!E.check(state, base0)) opts.push([null, "Don't collect evidence"]);
      if (!opts.length) { cancelCast(); return rulesNote(E.check(state, base0) || "You can't cast that."); }
      if (opts.length === 1) casting.evidence = opts[0][0];
      else return askChoice(`${f.name}: collect evidence ${f.evidence}?`, opts, again("evidence"));
    }
    if (E.isLand(f)) {
      const a = { type: "play", id: card.id, face: casting.face ?? undefined };
      // "As this land enters, you may pay N life. If you don't, it enters tapped."
      if (f.payLifeOrTapped && casting.payLife == null && !E.check(state, a)) {
        const n = f.payLifeOrTapped;
        const opts = [...(E.canPayLife(state, n) ? [[true, `Pay ${n} life (enters untapped)`]] : []), [false, "Don't pay (enters tapped)"]];
        return askChoice(`${f.name}: pay ${n} life?`, opts, again("payLife"));
      }
      if (casting.payLife != null) a.payLife = casting.payLife;
      const why = E.check(state, a);
      cancelCast();
      return why ? rulesNote(why) : perform(a);
    }
    const why = E.check(state, { type: "cast", id: card.id, face: casting.face ?? undefined, evidence: casting.evidence ?? undefined });
    if (why) { cancelCast(); return rulesNote(why); }
    const n = f.chooseCount || 1;
    if (f.modes && casting.mode == null) {
      // spree: one or more modes, each adding its cost (only the combinations you can pay for and target are offered)
      const ids = f.modes.map((_, i) => i);
      const opts = f.spree
        ? E.subsets(ids).filter((l) => l.length && !E.check(state, { type: "cast", id: card.id, mode: l }))
          .map((l) => [l, l.map((i) => `${f.modes[i].plus} ${f.modes[i].text}`).join(" + ")])
        : n > 1 ? combos(ids, n).map((c) => [c, c.map((i) => f.modes[i].text).join(" + ")])
        : f.modes.map((m, i) => [i, m.text || `Mode ${i + 1}`]);
      if (!opts.length) { cancelCast(); return rulesNote(`Not enough mana for any mode of ${f.name}.`); }
      return askChoice(`${f.name}: ${f.spree ? "choose one or more (spree)" : `choose ${n === 1 ? "one" : n}`}`, opts, again("mode"));
    }
    if (f.chooseColor && casting.color == null) {
      return askChoice(`${f.name}: choose a color`, [..."WUBRG"].map((col) => [col, E.WORD_OF[col]]), again("color"));
    }
    if (E.parseCost(f.cost).x && casting.x == null) {
      const max = E.manaAvailable(state) - E.manaValue(f.cost);
      if (max < 1) { cancelCast(); return rulesNote(`Not enough mana for ${f.name}.`); }
      return askChoice(`${f.name}: choose X`, Array.from({ length: max }, (_, i) => [i + 1, String(i + 1)]), again("x"));
    }
    // compleated: Phyrexian pips paid with life instead of mana cost the planeswalker two loyalty each
    if (E.has(f, "compleated") && casting.lifePips === undefined) {
      const pips = E.parseCost(f.cost).pips.filter((p) => /\/P$/.test(p)).length;
      const opts = Array.from({ length: pips + 1 }, (_, k) => k)
        .filter((k) => !E.check(state, { type: "cast", id: card.id, face: casting.face ?? undefined, lifePips: k || undefined }))
        .map((k) => [k, k ? `Pay ${2 * k} life (enters with ${Number(f.loyalty) - 2 * k} loyalty)` : `Pay with mana (enters with ${f.loyalty} loyalty)`]);
      if (opts.length === 1) casting.lifePips = opts[0][0];
      else if (opts.length) return askChoice(`${f.name}: how do you pay?`, opts, again("lifePips"));
    }
    // Costs where you choose cards: all chosen on the board through pickCards (sacrifice, blight, behold, convoke)
    if (f.sacrifice && casting.sac == null) {
      return pickCards({ ids: E.sacrificeOptions(state, f), prompt: `Choose a creature to sacrifice for ${f.name}.`,
        confirm: "Sacrifice", then: ([id]) => again("sac")(id) });
    }
    const base = { type: "cast", id: card.id, face: casting.face ?? undefined };
    // blight: one creature of yours gets the -1/-1 counters; the other button skips it (optional) or pays instead
    if (f.blight && casting.blight === undefined) {
      const alt = f.blight.optional ? { label: "Don't blight", value: null }
        : f.blight.orPay && !E.check(state, { ...base, blight: "pay" }) ? { label: `Pay ${f.blight.orPay} instead`, value: "pay" } : null;
      return pickCards({ ids: E.blightOptions(state), confirm: `Blight ${f.blight.n}`, alt,
        prompt: `Choose a creature you control to blight ${f.blight.n} for ${f.name} (it gets ${f.blight.n} -1/-1 counter${f.blight.n > 1 ? "s" : ""}).`,
        then: (picked) => again("blight")(Array.isArray(picked) ? picked[0] : picked) });
    }
    // bargain (optional): sacrifice an artifact, enchantment, or token you control as you cast it
    if (f.bargain && casting.bargain === undefined) {
      const ids = E.bargainOptions(state).filter((id) => !E.check(state, { ...base, bargain: id }));
      if (!ids.length) casting.bargain = null;
      else return pickCards({ ids, confirm: "Bargain", alt: { label: "Don't bargain", value: null },
        prompt: `Bargain: you may sacrifice an artifact, enchantment, or token for ${f.name}.`,
        then: (picked) => again("bargain")(Array.isArray(picked) ? picked[0] : picked) });
    }
    // behold: a creature of that type on your battlefield, or a card of that type revealed from your hand
    if (f.behold && casting.behold === undefined) {
      const ids = E.beholdOptions(state, f);
      const canPay = f.behold.orPay && !E.check(state, { ...base, behold: "pay" });
      if (!ids.length && !canPay) { cancelCast(); return rulesNote(`Not enough mana for ${f.name}.`); }
      if (!ids.length) casting.behold = "pay";                   // (nothing to behold: paying is the only way)
      else {
        const n = f.behold.count || 1;
        return pickCards({ ids, min: n, max: n, confirm: "Behold", alt: canPay ? { label: `Pay ${f.behold.orPay} instead`, value: "pay" } : null,
          prompt: `Behold ${n > 1 ? n + " " + f.behold.type + "s" : "a " + f.behold.type} for ${f.name}: choose on your battlefield or reveal from your hand.`,
          then: (picked) => again("behold")(Array.isArray(picked) ? (n > 1 ? picked : picked[0]) : picked) });
      }
    }
    // convoke: any set of your untapped creatures that, with your mana, pays the cost (only those can be picked)
    if (E.has(f, "convoke") && casting.convoke === undefined) {
      const costs = { ...base, behold: casting.behold ?? undefined };
      const sets = E.subsets(E.convokeHelpers(state)).filter((l) => !E.check(state, { ...costs, convoke: l }));
      if (sets.length === 1 && !sets[0].length) casting.convoke = [];            // (no creature can help: mana only)
      else {
        const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
        return pickCards({ ids: [...new Set(sets.flat())], min: 0, max: Math.max(...sets.map((l) => l.length)),
          prompt: `Convoke: tap your untapped creatures to help pay for ${f.name} (each pays {1} or one mana of its color)` +
            (sets.some((l) => !l.length) ? `, or press "Mana only" to pay with mana.` : "."),
          confirm: (l) => (l.length ? `Convoke (${l.length})` : "Mana only"),
          complete: (l) => sets.some((set) => same(set, l)),
          canAdd: (l) => sets.some((set) => l.every((x) => set.includes(x))),
          then: (l) => again("convoke")(l) });
      }
    }
    // offspring (an optional additional cost) and gift (an optional promise): ask when both ways are possible
    const extras = { ...base, behold: casting.behold ?? undefined, convoke: casting.convoke ?? undefined, bargain: casting.bargain ?? undefined };
    if (f.offspring && casting.offspring === undefined) {
      const can = !E.check(state, { ...extras, offspring: true });
      if (!can) casting.offspring = false;
      else return askChoice(`${f.name}: pay offspring ${f.offspring}?`, [[true, `Pay offspring ${f.offspring} (a 1/1 token copy)`], [false, "No offspring"]], again("offspring"));
    }
    if (f.gift && casting.gift === undefined) {
      const what = { Fish: "a tapped 1/1 Fish", Food: "a Food token", Treasure: "a Treasure token", card: "a card" }[f.gift] || f.gift;
      return askChoice(`${f.name}: promise a gift?`, [[true, `Promise the gift (the opponent gets ${what})`], [false, "No gift"]], again("gift"));
    }
    casting.phases = casting.phases || spellPhases(f);
    targetPhase();
  }

  // The groups of targets a spell needs, in order: one per part (per chosen mode), one per slot (fight: yours, then theirs)
  function spellPhases(f) {
    // a permanent spell has no targets; its enters trigger asks for one after it resolves (CR 603.3d)
    if (!f.aura && /creature|artifact|enchantment|planeswalker|battle/i.test(f.type || "")) return [];
    const out = [];
    E.plan(f, { mode: casting.mode, x: casting.x, bargain: casting.bargain ?? undefined, evidence: casting.evidence ?? undefined, gift: casting.gift || undefined }).forEach((p, part) => {
      if (p.slots) p.slots.forEach((sl, slot) => out.push({ kind: sl.targets, filter: sl.filter, count: ONE, src: f, part, slot,
        label: f.name, which: sl.filter && sl.filter.controller === "you" ? "your creature" : sl.filter && sl.filter.controller === "opponent" ? "a creature you don't control" : null }));
      else if (p.targets) out.push({ kind: p.targets, filter: p.filter, count: p.count || ONE, src: f, part, label: f.name });
    });
    return out;
  }

  // Ask for the targets of the current group; when every group is done, put the action together
  function targetPhase() {
    if (casting.trigger && !casting.phases) {
      const p = E.pendingTrigger(state);
      casting.phases = [{ kind: p.targets, filter: p.filter, count: p.count || ONE, src: p.src, label: `${p.name}'s ability` }];
    }
    casting.k = casting.k || 0;
    while (casting.k < casting.phases.length) {
      const ph = casting.phases[casting.k];
      const sameSlotGroup = casting.phases.map((x, i) => (x.part === ph.part && x.slot != null && i < casting.k ? casting.results[i] : null)).filter(Boolean);
      const list = E.targetsFor(state, ph.src, ph.kind, ph.filter).filter((x) => x !== casting.sac && !sameSlotGroup.includes(x));
      if (!list.length) {
        if (ph.optional || ph.count.min === 0) { casting.results[casting.k++] = undefined; continue; }
        cancelCast();
        return rulesNote(`There's no legal target for ${ph.label}.`);
      }
      casting.picks = [];
      markChoices(list);
      updateDone(ph);
      return setPrompt(ph.count.max > 1 ? `Choose up to ${ph.count.max} targets for ${ph.label}, then press Done.`
        : `Choose ${ph.which || "a target"} for ${ph.label}.`);
    }
    assemble();
  }

  // Turn the chosen targets into the action's target (and ask how to divide damage, if needed)
  function assemble() {
    if (casting.trigger || casting.index != null) return finishChoice(casting.results[0]);
    const f = faceNow();
    const phases = casting.phases;
    if (!phases.length || phases[0].optional) return finishChoice(casting.results[0]);
    const parts = E.plan(f, { mode: casting.mode, x: casting.x, bargain: casting.bargain ?? undefined, evidence: casting.evidence ?? undefined, gift: casting.gift || undefined });
    const perPart = parts.map((p, part) => {
      const mine = phases.map((ph, i) => (ph.part === part ? casting.results[i] : undefined)).filter((_, i) => phases[i].part === part);
      return p.slots ? mine : mine[0];
    });
    const target = E.manyModes(f) ? perPart : perPart[0];
    const p0 = parts[0];
    if (p0 && p0.effect && p0.effect.divided && target != null) {
      const ts = [].concat(target);
      const name = (id) => (id === "opp" ? "opponent" : id === "you" ? "you" : (E.castable(state, id) || {}).card?.name ||
        [...state.player.battlefield, ...state.opponent.battlefield].find((c) => c.id === id)?.name || id);
      const opts = E.compositions(p0.total, ts.length).map((split) => [split, split.map((n, i) => `${n} to ${name(ts[i])}`).join(", ")]);
      return askChoice(`${f.name}: divide ${p0.total} damage`, opts, (split) => { casting.split = split; finishChoice(ts); });
    }
    finishChoice(target);
  }

  // The action being built: casting a spell, activating ability `index` of a permanent, or a waiting trigger's target
  const actionFor = (target) => casting.trigger ? { type: "trigger", target }
    : casting.index != null ? { type: "activate", id: casting.card.id, index: casting.index, target, x: casting.x ?? undefined, crew: casting.crew ?? undefined, craft: casting.craft ?? undefined }
    : { type: "cast", id: casting.card.id, face: casting.face ?? undefined, target, sac: casting.sac ?? undefined,
      mode: casting.mode ?? undefined, color: casting.color ?? undefined, x: casting.x ?? undefined, split: casting.split,
      blight: casting.blight ?? undefined, behold: casting.behold ?? undefined, convoke: casting.convoke ?? undefined,
      lifePips: casting.lifePips || undefined, bargain: casting.bargain ?? undefined, evidence: casting.evidence ?? undefined, faceDown: casting.faceDown || undefined, offspring: casting.offspring || undefined, gift: casting.gift || undefined };

  function finishChoice(target) {
    const action = actionFor(target);
    const why = E.check(state, action);
    cancelCast();
    if (why) return rulesNote(why);
    setPrompt(current.prompt);
    perform(action);
  }

  function choose(id) {
    if (!casting) return false;
    const n = elFor(id);
    if (!n || !n.classList.contains("targetable")) return true;    // not a valid choice: ignore the click
    if (casting.pick) { togglePick(id); return true; }         // choosing cards for a cost
    const ph = casting.phases[casting.k];
    if (ph.count.max > 1) {                                      // several targets: pick and unpick, then Done
      casting.picks = casting.picks.includes(id) ? casting.picks.filter((x) => x !== id) : [...casting.picks, id];
      n.classList.toggle("picked", casting.picks.includes(id));
      updateDone(ph);
      if (casting.picks.length === ph.count.max) donePhase();
      return true;
    }
    casting.results[casting.k++] = id;
    markChoices([]);
    targetPhase();
    return true;
  }
  function donePhase() {
    casting.results[casting.k++] = [...casting.picks];
    document.querySelectorAll(".picked").forEach((c) => c.classList.remove("picked"));
    $("done-targets").hidden = true;
    markChoices([]);
    targetPhase();
  }

  function updateDone(ph) {
    const btn = $("done-targets");
    btn.hidden = !(ph && ph.count.max > 1 && casting.picks.length >= ph.count.min);
    btn.textContent = `Done (${casting.picks.length})`;
  }
  $("done-targets").addEventListener("click", () => { if (casting && casting.phases) donePhase(); });

  /* ---------- choosing cards on the board for a cost ---------- */
  // One selection mode for every cost where you pick cards (sacrifice, blight, behold, convoke): the valid cards
  // light up, clicked ones are marked, Confirm is offered once the choice is complete (min..max, and complete()),
  // canAdd() keeps a pick from leading nowhere (convoke), an alternative button ("Pay {2} instead", "Don't blight")
  // and Cancel sit next to it. then() gets the picked ids, or the alternative's value.
  function pickCards({ ids, min = 1, max = 1, prompt, confirm = "Confirm", complete = () => true, canAdd = () => true, alt = null, then }) {
    casting.pick = { ids, min, max, picks: [], confirm, complete, canAdd, alt, then, prompt };
    setPrompt(prompt);
    $("pick-alt").hidden = !alt;
    if (alt) $("pick-alt").textContent = alt.label;
    $("pick-cancel").hidden = false;
    $("go").hidden = $("reset").hidden = true;
    refreshPick();
  }
  // which cards can be clicked now (picked ones, to unpick them, and ones that can still be added), and the Confirm button
  function refreshPick() {
    const p = casting.pick;
    const addable = p.ids.filter((id) => !p.picks.includes(id) && p.picks.length < p.max && p.canAdd([...p.picks, id]));
    markChoices([...p.picks, ...addable]);
    document.querySelectorAll(".picked").forEach((n) => n.classList.remove("picked"));
    p.picks.forEach((id) => { const n = elFor(id); if (n) n.classList.add("picked"); });
    const ok = $("pick-ok");
    ok.textContent = typeof p.confirm === "function" ? p.confirm(p.picks) : p.picks.length > 1 ? `${p.confirm} (${p.picks.length})` : p.confirm;
    ok.hidden = !(p.picks.length >= p.min && p.picks.length <= p.max && p.complete(p.picks));
    // say what's picked and what finishes it, so a pick is never silent
    const names = p.picks.map((id) => { const c = [...state.player.battlefield, ...state.player.hand].find((x) => x.id === id); return c ? c.name : id; });
    setPrompt(!p.picks.length ? p.prompt
      : `${names.join(", ")} chosen. ` + (ok.hidden ? "Choose more, or click a chosen card to unchoose it." : `Press "${ok.textContent}" to confirm, or click it again to unchoose.`));
  }
  function togglePick(id) {
    const p = casting.pick;
    if (p.picks.includes(id)) p.picks = p.picks.filter((x) => x !== id);
    else if (p.picks.length < p.max && p.canAdd([...p.picks, id])) p.picks = [...p.picks, id];
    refreshPick();
  }
  function endPick(result) {
    const { then } = casting.pick;
    closePick();
    then(result);
  }
  function closePick() {
    if (casting) casting.pick = null;
    ["pick-ok", "pick-alt", "pick-cancel"].forEach((b) => ($(b).hidden = true));
    $("go").hidden = $("reset").hidden = false;
    document.querySelectorAll(".picked").forEach((n) => n.classList.remove("picked"));
    markChoices([]);
  }
  $("pick-ok").addEventListener("click", () => { if (casting && casting.pick) endPick([...casting.pick.picks]); });
  $("pick-alt").addEventListener("click", () => { if (casting && casting.pick && casting.pick.alt) endPick(casting.pick.alt.value); });
  $("pick-cancel").addEventListener("click", () => { cancelCast(); setPrompt(current.prompt); });

  // A small box of buttons for a choice made while casting (side, modes, color, X, divided damage, scry)
  function askChoice(title, options, then, { mandatory = false } = {}) {
    $("choice-title").textContent = title;
    $("choice-options").replaceChildren(...options.map(([value, label]) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "ghost", textContent: label });
      b.addEventListener("click", () => { $("choice").hidden = true; then(value); });
      return b;
    }));
    $("choice-cancel").hidden = mandatory;
    $("choice").hidden = false;
  }
  $("choice-cancel").addEventListener("click", () => { $("choice").hidden = true; cancelCast(); setPrompt(current.prompt); });

  function cancelCast() {
    closePick();
    casting = null;
    markChoices([]);
    $("choice").hidden = true;
    $("done-targets").hidden = true;
    document.querySelectorAll(".picked").forEach((c) => c.classList.remove("picked"));
    document.querySelectorAll("#hand .card.casting").forEach((c) => c.classList.remove("selected", "casting"));
    document.querySelectorAll(".abil.on").forEach((b) => b.classList.remove("on"));
  }

  // Something of yours is waiting: a trigger's target ("when this dies, …"), or a scry/surveil choice
  function promptTrigger() {
    cancelCast();
    const p = E.pendingTrigger(state);
    if (p.kind === "scry") {
      casting = { trigger: true, card: null, results: [], picks: [] };
      const opts = E.legalActions(state).filter((a) => a.type === "scry").map((a) => [a, E.describe(state, a).replace(/^scry: /, "")]);
      return askChoice(`${p.name} ${p.n}: what goes where?`, opts, (a) => { cancelCast(); perform(a); }, { mandatory: true });
    }
    // two replacement effects want to change the same event: you choose which applies (CR 616.1)
    if (p.kind === "choice") {
      casting = { trigger: true, card: null, results: [], picks: [] };
      return askChoice(p.name, p.labels.map((label, pick) => [{ type: "choice", pick }, label]), (a) => { cancelCast(); perform(a); }, { mandatory: true });
    }
    // several of your triggers at once: you choose which goes on the stack first (it resolves last)
    const order = E.legalActions(state).filter((a) => a.type === "order");
    if (order.length) {
      casting = { trigger: true, card: null, results: [], picks: [] };
      const opts = order.map((a) => [a, `${state.pending[a.pick].name}'s trigger`]);
      return askChoice("Your triggers: which goes on the stack first? (It resolves last.)", opts, (a) => { cancelCast(); perform(a); }, { mandatory: true });
    }
    casting = { trigger: true, card: null, results: [], picks: [] };
    nextChoice();
  }

  // Activated abilities: a button per ability on your permanents
  function useAbility(card, index, btn) {
    if (casting && casting.trigger) return;
    if (casting && casting.card && casting.card.id === card.id && casting.index === index) { cancelCast(); setPrompt(current.prompt); return; }
    cancelCast();
    clearAttackers();
    const ab = E.abilitiesOf(card)[index];
    const why = E.check(state, { type: "activate", id: card.id, index, target: firstTarget(card, index), x: E.parseCost(ab.cost).x ? 1 : undefined,
      crew: ab.crew ? crewIds(card) : undefined,
      craft: ab.craft ? (E.legalActions(state).find((a) => a.type === "activate" && a.id === card.id && a.index === index && a.craft) || {}).craft : undefined });
    if (why) return rulesNote(why, btn.closest(".card"));
    casting = { card, index, results: [], picks: [] };
    btn.classList.add("on");
    nextChoice();
  }
  const crewIds = (vehicle) => E.convokeHelpers(state).filter((id) => id !== vehicle.id);
  const firstTarget = (card, index) => {
    const ab = E.abilitiesOf(card)[index];
    if (!ab.targets) return undefined;
    const list = E.targetChoices(E.targetsFor(state, card, ab.targets, ab.filter), ab.targetCount);
    return list[0];
  };

  let lastTap = {};
  function clearAttackers() {
    selected = new Set();
    document.querySelectorAll("#you-lane .card.selected").forEach((c) => c.classList.remove("selected", "tapping"));
    updateButton();
  }

  $("opp-lane").addEventListener("click", (e) => {
    if (swallowClick || locked || !casting) return;
    const el = e.target.closest(".card");
    if (el) choose(el.dataset.id);
  });
  $("opp-life").addEventListener("click", () => { if (!swallowClick && !locked) choose("opp"); });
  $("you-life").addEventListener("click", () => { if (!swallowClick && !locked) choose("you"); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && casting && !casting.trigger) { cancelCast(); setPrompt(current.prompt); }
  });

  /* ---------- selecting attackers ---------- */
  $("you-lane").addEventListener("click", (e) => {
    if (swallowClick || locked) return;
    const el = e.target.closest(".card");
    if (!el) return;
    if (casting) return choose(el.dataset.id);
    const card = state.player.battlefield.find((c) => c.id === el.dataset.id);
    const abilityBtn = e.target.closest(".abil");
    if (card && abilityBtn) return useAbility(card, Number(abilityBtn.dataset.index), abilityBtn);
    if (card && E.isTreasure(card)) {                       // mana ability: sacrifice it for one mana of any color
      const why = E.check(state, { type: "mana", id: card.id });
      return why ? rulesNote(why, el) : perform({ type: "mana", id: card.id });
    }
    if (!card || !E.isCreature(card) || card.tapped) return;
    // a quick second tap on the same creature belongs to the same double tap: one toggle per (double) tap
    const now = performance.now();
    if (lastTap.id === card.id && now - lastTap.t < 350) { lastTap = {}; return; }
    lastTap = { id: card.id, t: now };
    const why = E.check(state, { type: "attack", ids: [card.id] });
    if (why && !selected.has(card.id)) return rulesNote(why, el);
    // a chosen attacker turns sideways (it taps when it attacks, unless it has vigilance)
    if (selected.has(card.id)) { selected.delete(card.id); el.classList.remove("selected", "tapping"); }
    else { selected.add(card.id); el.classList.add("selected"); if (!E.has(card, "vigilance")) el.classList.add("tapping"); }
    fitRows();
    setPrompt(selected.size ? `${selected.size} attacker${selected.size > 1 ? "s" : ""} selected.` : current.prompt);
    updateButton();
  });

  $("go").addEventListener("click", () => {
    if (locked) return;
    if (stackWaits()) { cancelCast(); return perform({ type: "pass" }); }
    if (!selected.size) return;
    cancelCast();
    const action = { type: "attack", ids: [...selected] };
    const why = E.check(state, action);
    if (why) return rulesNote(why);
    // with planeswalkers on the other side or your own Sieges (the opponent protects them), say what each attacker
    // attacks (CR 508.1b)
    const walkers = [...state.opponent.battlefield.filter((c) => E.isPlaneswalker(c)), ...state.player.battlefield.filter((c) => E.isBattle(c))];
    const label = (w) => E.isBattle(w) ? `${w.name} (${E.defenseOf(w)} defense)` : `${w.name} (${E.loyaltyOf(w)} loyalty)`;
    const ask = (i) => {
      if (i >= action.ids.length) { setPrompt(current.prompt); return perform(action); }
      const id = action.ids[i], name = state.player.battlefield.find((c) => c.id === id).name;
      askChoice(`${name} attacks:`, [["opp", "Your opponent"], ...walkers.map((w) => [w.id, label(w)])], (to) => {
        if (to !== "opp") action.at = { ...(action.at || {}), [id]: to };
        ask(i + 1);
      }, { mandatory: true });
    };
    if (walkers.length) return ask(0);
    setPrompt(current.prompt);
    perform(action);
  });

  /* ---------- resolving actions ---------- */
  // Animate on the current board, then swap in the engine's new state
  function perform(action) {
    const { state: next, events } = E.apply(state, action);
    locked = true;
    selected = new Set();
    updateButton();
    let delay = 0;
    if (action.type === "cast") {
      const spellEl = document.querySelector(`#hand .card[data-id="${action.id}"]`);
      if (spellEl) spellEl.classList.add("resolving");
      delay = 500;
    }
    if (action.type === "attack") {
      showPhase("attackers");
      action.ids.forEach((id) => {
        const el = document.querySelector(`#you-lane .card[data-id="${id}"]`);
        if (!el) return;
        // The sideways preview of a chosen attacker comes from .selected.tapping; swap it for the real tapped state
        // (from the engine's new state) in the same step, or the card would stand up until the board is redrawn
        const now = next.player.battlefield.find((c) => c.id === id);
        el.classList.toggle("tapped", !!(now && now.tapped));
        el.classList.remove("selected", "tapping");
        el.classList.add("in-combat");
      });
      delay = 250;
    }
    // combat damage: your creatures that deal damage bump toward the opponent as it lands
    const strikers = events.filter((ev) => ev.type === "strike" && ev.side === "player").map((ev) => ev.id);
    strikers.forEach((id) => {
      const el = document.querySelector(`#you-lane .card[data-id="${id}"]`);
      if (el) { el.classList.remove("attacking"); void el.offsetWidth; el.classList.add("attacking"); }
    });
    if (strikers.length) {
      delay = Math.max(delay, 560);
      showPhase(next.combat && next.combat.fsHappened && E.at(next.phase) <= E.at("fsdamage") ? "fsdamage" : "damage");
    }
    // damage and life changes float up as numbers (at the bump's peak for combat, as a spell resolves otherwise)
    setTimeout(() => floatNumbers(events), strikers.length ? 180 : action.type === "cast" ? 380 : 0);
    // combat damage and other deaths: let the dying cards fade before the board updates
    const deaths = events.filter((ev) => ev.type === "left" && ev.id !== action.sac && ev.zone !== "hand");
    const damaged = events.some((ev) => ev.type === "damage" || (ev.type === "life" && ev.amount < 0));
    if (action.type === "advance" && (deaths.length || damaged)) delay = 380;
    deaths.forEach((ev) => {
      const el = document.querySelector(`.lane .card[data-id="${ev.id}"]`);
      if (el) el.classList.add("dying");
    });
    const before = state.opponent.life;
    setTimeout(() => {
      state = next;
      render();
      if (state.opponent.life < before) $("opp-life").classList.add("hit");
      setTimeout(() => {
        if (E.won(state)) return victory();
        if (E.turnOver(state)) return endTurn();
        if (state.pending.length) { locked = false; updateButton(); return promptTrigger(); }
        locked = false;
        updateButton();
        if (stackWaits()) return setPrompt(stackPrompt());          // you have priority with something on the stack
        setPrompt(current.prompt);
        autoAdvance();
      }, damaged ? 450 : 0);
    }, delay);
  }

  // A "-3" (or "+2" for life gained) rises from what was hit and fades out
  function floatNumbers(events) {
    events.forEach((ev) => {
      let target, n;
      if (ev.type === "life") { target = lifeBox(ev.who); n = ev.amount; }
      else if (ev.type === "damage") { target = document.querySelector(`.lane .card[data-id="${ev.id}"]`); n = -ev.amount; }
      else return;
      if (!target || !n) return;
      const r = target.getBoundingClientRect();
      const f = document.createElement("div");
      f.className = "floater" + (n > 0 ? " gain" : "");
      f.textContent = (n > 0 ? "+" : "−") + Math.abs(n);
      f.style.left = `${r.left + r.width / 2}px`;
      f.style.top = `${r.top + r.height / 2}px`;
      document.body.appendChild(f);
      f.addEventListener("animationend", () => f.remove());
      setTimeout(() => f.remove(), 1300);                    // in case animations are off
    });
  }

  // Judged only when the turn reaches the end step: if the opponent is still alive, the attempt failed
  function endTurn() {
    locked = true;
    updateButton();
    mark(current.id, "failed");
    setTimeout(() => {
      $("sheet").classList.add("fail");
      $("sheet").classList.remove("long");
      $("sheet-title").textContent = "Failed";
      $("sheet-body").textContent = E.lost(state) ? "Your life hit 0, so you lost the game. Try again."
        : "Your turn is over and your opponent survived. Try again.";
      const btn = $("sheet-btn"), alt = $("sheet-alt");
      btn.textContent = "Try again"; btn.onclick = load;
      alt.hidden = false; alt.textContent = current.custom ? "Back to creator" : "Back to puzzles"; alt.onclick = leaveGame;
      $("sheet").hidden = false;
    }, 300);
  }

  /* ---------- confetti burst on a solve ---------- */
  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const cv = document.createElement("canvas");
    cv.className = "confetti";
    const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);
    const colors = ["#e0a43a", "#d8553f", "#6fbf73", "#efe6d6", "#5b8bd8"];
    const size = Math.max(6, Math.min(W, H) / 110);
    const parts = Array.from({ length: 150 }, (_, i) => {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.8;    // fan upward from the middle
      const v = (0.6 + Math.random() * 0.6) * Math.sqrt(H) * 0.6;
      return { x: W / 2, y: H * 0.55, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        w: size * (1 + Math.random()), h: size * (0.6 + Math.random() * 0.5),
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: colors[i % colors.length] };
    });
    const LIFE = 2400, start = performance.now();
    (function frame(t) {
      const age = t - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - age / LIFE);
      for (const p of parts) {
        p.vy += 0.3; p.vx *= 0.985; p.vy *= 0.985;
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (age < LIFE) requestAnimationFrame(frame); else cv.remove();
    })(start);
  }

  function victory() {
    mark(current.id, "solved");
    confetti();
    $("sheet").classList.remove("fail", "long");
    $("sheet-title").textContent = "Lethal!";
    $("sheet-body").textContent = "";
    const set = setOf(current.difficulty);
    const next = set[set.indexOf(current) + 1];
    const btn = $("sheet-btn"), alt = $("sheet-alt");
    const toLevels = () => showLevels(current.difficulty);
    alt.hidden = false;
    if (current.custom) {
      btn.textContent = "Back to creator"; btn.onclick = showCreator;
      alt.textContent = "Play again"; alt.onclick = load;
    } else if (next) {
      btn.textContent = "Next puzzle"; btn.onclick = () => play(next);
      alt.textContent = "Back to puzzles"; alt.onclick = toLevels;
    } else {
      btn.textContent = "Back to puzzles"; btn.onclick = toLevels;
      alt.textContent = "Play again"; alt.onclick = load;
    }
    $("sheet").hidden = false;
  }

  $("reset").addEventListener("click", load);

  // Testing aid: show the intended line without ending the attempt
  $("solution").addEventListener("click", () => {
    if (!$("sheet").hidden) return;
    $("sheet").classList.remove("fail");
    $("sheet").classList.add("long");
    $("sheet-title").textContent = "Solution";
    const body = $("sheet-body");
    body.textContent = (current.explanation || "") + "\n\nWorking out every winning line…";
    const btn = $("sheet-btn");
    btn.textContent = "Close"; btn.onclick = () => ($("sheet").hidden = true);
    $("sheet-alt").hidden = true;
    $("sheet").hidden = false;
    // The solver's answer, from the same rules engine, so it's always right
    setTimeout(() => {
      const r = E.solve(current);
      const plans = r.minimal.map((l, i) => `${r.minimal.length > 1 ? `${i + 1}. ` : ""}${l.join(" → ")}`);
      body.textContent = (current.explanation ? current.explanation + "\n\n" : "") +
        (plans.length ? `Winning line${plans.length > 1 ? "s" : ""} (any order that's legal works):\n${plans.join("\n")}` : "No winning line found.");
    }, 30);
  });

  // ?p=<id> jumps straight into a puzzle; otherwise start at the menu
  const deep = window.PUZZLES.find((p) => p.id === new URLSearchParams(location.search).get("p"));
  if (deep) play(deep); else showMenu();
})();
