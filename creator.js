/* Puzzle creator: build a board by hand and play-test it.
 *
 * Add cards by name (Scryfall search), drag them between zones (battlefields, hands, graveyards,
 * exiles, libraries), set life totals, tap cards, mark them as just cast, give them counters and
 * attach Auras/Equipment. Cards are read into rules by cardtext.js; anything it can't read is
 * flagged. Drafts autosave; saved puzzles live in this browser, and "Copy as code" gives an entry
 * for puzzles.js.
 */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const E = window.Engine;
  const { CARDS, puzzle } = window.CARD_CATALOG;
  const { fromScryfall } = window.CardText;
  const app = window.FindLethal;

  const DRAFT = "find-lethal:creator-draft";
  const SAVED = "find-lethal:creations";
  const ZONES = ["opp.battlefield", "opp.graveyard", "opp.exile", "opp.library",
    "you.battlefield", "you.hand", "you.graveyard", "you.exile", "you.library"];

  const blank = () => ({ title: "", difficulty: "easy", oppLife: 20, youLife: null, nextId: 1,
    zones: Object.fromEntries(ZONES.map((z) => [z, []])) });
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch (_) { return fallback; } };
  const store = (key, v) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch (_) { /* storage unavailable: fine */ } };

  let draft = load(DRAFT, null) || blank();
  const fill = () => ZONES.forEach((z) => { draft.zones[z] = draft.zones[z] || []; });
  fill();
  const save = () => store(DRAFT, draft);

  async function scry(path) {
    const r = await fetch("https://api.scryfall.com/" + path);
    if (!r.ok) throw new Error(r.status === 404 ? "Card not found." : "Scryfall didn't answer (" + r.status + ").");
    return r.json();
  }

  /* ---------- rendering ---------- */
  const cardById = (id) => { for (const z of ZONES) { const card = draft.zones[z].find((x) => x.id === id); if (card) return [card, z]; } return [null, null]; };
  let attaching = null;                                        // an Aura/Equipment waiting for "which creature?"

  function render() {
    $("cr-title").value = draft.title;
    $("cr-diff").value = draft.difficulty;
    $("cr-opp-life").textContent = draft.oppLife;
    $("cr-you-life").textContent = draft.youLife == null ? "∞" : draft.youLife;
    $("cr-you-inf").hidden = draft.youLife == null;
    document.querySelectorAll("#creator .cr-zone").forEach((zone) => {
      const cards = draft.zones[zone.dataset.zone];
      zone.replaceChildren(...cards.map((card) => {
        const el = app.cardEl(card);
        el.classList.add("cr-card");
        if (card.sick) el.classList.add("cr-sick");
        if (attaching && attaching !== card.id && zone.dataset.zone.endsWith("battlefield") && E.isCreature(card)) el.classList.add("cr-attach-target");
        if (card.attachedTo) {
          const [host] = cardById(card.attachedTo);
          if (host) el.append(Object.assign(document.createElement("div"), { className: "attachchip", textContent: `On ${host.name}` }));
        }
        if (card.unmodeled) {
          el.append(Object.assign(document.createElement("div"), { className: "cr-warn",
            title: "Not supported: " + (card.unread || []).join(" / "), textContent: "⚠ rules not supported" }));
        }
        return el;
      }));
    });
    const unmodeled = ZONES.flatMap((z) => draft.zones[z]).filter((x) => x.unmodeled);
    if (attaching) status("Tap the creature to attach it to (or tap it again to cancel).", "warn");
    else status(unmodeled.length ? `⚠ The game can't play part of these cards yet: ${unmodeled.map((x) => `${x.name} (${(x.unread || []).join(" / ") || "special"})`).join("; ")}.` : "", "warn");
    renderSaved();
    // Submit lights up once this exact board was won in a play test
    $("cr-submit-open").className = verifiedNow() ? "primary" : "ghost";
  }

  function status(text, kind = "") {
    const s = $("cr-status");
    s.textContent = text;
    s.className = "cr-status " + kind;
  }

  function renderSaved() {
    const saved = load(SAVED, []);
    const sel = $("cr-load");
    sel.replaceChildren(new Option(saved.length ? `Saved puzzles (${saved.length})…` : "No saved puzzles", ""),
      ...saved.map((p, i) => new Option(p.title || `Untitled ${i + 1}`, String(i))));
  }

  /* ---------- editing ---------- */
  function addCard(card, zone) {
    card.id = "cr" + draft.nextId++;
    draft.zones[zone].push(card);
    save(); render();
  }

  function moveCard(id, to) {
    const [card, from] = cardById(id);
    if (!card || from === to) return;
    draft.zones[from] = draft.zones[from].filter((x) => x !== card);
    // only the battlefield keeps tapped/sick/counters/attachments
    if (!to.endsWith("battlefield")) {
      ["tapped", "sick", "counters", "attachedTo"].forEach((k) => delete card[k]);
      ZONES.forEach((z) => draft.zones[z].forEach((x) => { if (x.attachedTo === id) delete x.attachedTo; }));
    }
    draft.zones[to].push(card);
    save(); render();
  }

  // life totals: + and -, and your life can go back to ∞ (irrelevant)
  document.querySelectorAll("#creator [data-life]").forEach((b) => b.addEventListener("click", () => {
    const d = Number(b.dataset.d);
    if (b.dataset.life === "opp") draft.oppLife = Math.max(1, draft.oppLife + d);
    else draft.youLife = Math.max(1, (draft.youLife == null ? 20 : draft.youLife) + d);
    save(); render();
  }));
  $("cr-you-inf").addEventListener("click", () => { draft.youLife = null; save(); render(); });
  $("cr-title").addEventListener("input", (e) => { draft.title = e.target.value; save(); });
  $("cr-diff").addEventListener("change", (e) => { draft.difficulty = e.target.value; save(); });

  /* ---------- search ---------- */
  let searchTimer = null, searchRun = 0;
  $("cr-add").addEventListener("click", () => {
    $("cr-search").hidden = false;
    $("cr-q").value = "";
    $("cr-results").replaceChildren();
    $("cr-search-msg").textContent = "Start typing to search Scryfall.";
    $("cr-q").focus();
  });
  const closeSearch = () => { $("cr-search").hidden = true; };
  $("cr-search-close").addEventListener("click", closeSearch);
  $("cr-search").addEventListener("click", (e) => { if (e.target === $("cr-search")) closeSearch(); });

  $("cr-q").addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = $("cr-q").value.trim();
    if (q.length < 2) { $("cr-results").replaceChildren(); $("cr-search-msg").textContent = "Start typing to search Scryfall."; return; }
    searchTimer = setTimeout(async () => {                     // wait for a pause in typing (Scryfall asks for few requests)
      const mine = ++searchRun;
      $("cr-search-msg").textContent = "Searching…";
      try {
        const r = await scry("cards/autocomplete?q=" + encodeURIComponent(q));
        if (mine !== searchRun) return;
        $("cr-results").replaceChildren(...r.data.slice(0, 12).map((name) => {
          const li = document.createElement("li");
          const b = Object.assign(document.createElement("button"), { type: "button", textContent: name });
          b.addEventListener("click", () => pick(name));
          li.append(b);
          return li;
        }));
        $("cr-search-msg").textContent = r.data.length ? "" : "No cards found.";
      } catch (err) {
        if (mine === searchRun) $("cr-search-msg").textContent = "Couldn't search: " + err.message;
      }
    }, 300);
  });
  $("cr-q").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const first = $("cr-results").querySelector("button"); if (first) first.click(); }
    if (e.key === "Escape") closeSearch();
  });

  async function pick(name) {
    $("cr-search-msg").textContent = `Adding ${name}…`;
    try {
      const j = await scry("cards/named?exact=" + encodeURIComponent(name));
      addCard(fromScryfall(j), $("cr-dest").value);
      $("cr-search-msg").textContent = `Added ${name}. Search for another card, or press Done.`;
      $("cr-q").select();
    } catch (err) {
      $("cr-search-msg").textContent = "Couldn't add it: " + err.message;
    }
  }

  /* ---------- dragging (mouse and touch) and tapping a card ---------- */
  let drag = null;
  $("creator").addEventListener("pointerdown", (e) => {
    const el = e.target.closest(".cr-card");
    if (!el || e.button > 0) return;
    drag = { el, id: el.dataset.id, x: e.clientX, y: e.clientY, ghost: null };
  });
  window.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      const r = drag.el.getBoundingClientRect();
      drag.ghost = drag.el.cloneNode(true);
      drag.ghost.classList.add("cr-ghost");
      Object.assign(drag.ghost.style, { width: r.width + "px", height: r.height + "px" });
      document.body.append(drag.ghost);
      drag.el.classList.add("cr-dragging");
      closeMenu();
    }
    drag.ghost.style.left = e.clientX + "px";
    drag.ghost.style.top = e.clientY + "px";
    document.querySelectorAll(".cr-zone.over").forEach((z) => z.classList.remove("over"));
    const zone = zoneAt(e.clientX, e.clientY);
    if (zone) zone.classList.add("over");
  });
  window.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    document.querySelectorAll(".cr-zone.over").forEach((z) => z.classList.remove("over"));
    if (d.ghost) {
      d.ghost.remove();
      d.el.classList.remove("cr-dragging");
      const zone = zoneAt(e.clientX, e.clientY);
      if (zone) moveCard(d.id, zone.dataset.zone);
    } else if (attaching) finishAttach(d.id);
    else openMenu(d.id, d.el);
  });
  window.addEventListener("pointercancel", () => {
    if (drag && drag.ghost) { drag.ghost.remove(); drag.el.classList.remove("cr-dragging"); }
    drag = null;
  });
  const zoneAt = (x, y) => { const n = document.elementFromPoint(x, y); return n && n.closest("#creator .cr-zone"); };

  // Attaching an Aura or Equipment: the next creature tapped on a battlefield becomes its host
  function finishAttach(id) {
    const [thing] = cardById(attaching);
    const [host, zone] = cardById(id);
    if (thing && host && id !== attaching && zone.endsWith("battlefield") && E.isCreature(host)) thing.attachedTo = id;
    attaching = null;
    save(); render();
  }

  // Options for one card: tap, just cast, counters, attach, remove
  function openMenu(id, el) {
    const [card, zone] = cardById(id);
    if (!card) return;
    const menu = $("cr-menu");
    const onField = zone.endsWith("battlefield");
    const isCreature = E.isCreature(card);
    const btn = (label, fn, cls = "") => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "ghost small-btn " + cls, textContent: label });
      b.addEventListener("click", () => { fn(); save(); render(); if (!attaching) openMenu(id, document.querySelector(`#creator .cr-card[data-id="${id}"]`)); });
      return b;
    };
    const counter = (type) => {
      const n = (card.counters && card.counters[type]) || 0;
      const set = (v) => { card.counters = { ...(card.counters || {}), [type]: Math.max(0, v) }; if (!card.counters[type]) delete card.counters[type]; };
      const row = document.createElement("div");
      row.className = "cr-row";
      row.append(Object.assign(document.createElement("span"), { textContent: `${type} counters` }),
        btn("−", () => set(n - 1)), Object.assign(document.createElement("b"), { textContent: n }), btn("+", () => set(n + 1)));
      return row;
    };
    const kids = [Object.assign(document.createElement("h3"), { textContent: card.name })];
    if (onField) kids.push(btn(card.tapped ? "Untap" : "Tap", () => { card.tapped = !card.tapped; }));
    if (onField && isCreature && zone === "you.battlefield") {
      kids.push(btn(card.sick ? "✓ Cast this turn (summoning sick)" : "Cast this turn (summoning sick)", () => { card.sick = !card.sick; }));
    }
    if (onField && isCreature) kids.push(counter("+1/+1"), counter("-1/-1"));
    if (onField && (card.aura || card.equip)) {
      kids.push(btn(card.attachedTo ? "Attach to another creature" : "Attach to a creature", () => { attaching = id; setTimeout(closeMenu); }));
      if (card.attachedTo) kids.push(btn("Unattach", () => { delete card.attachedTo; }));
    }
    kids.push(btn("Remove card", () => {
      draft.zones[zone] = draft.zones[zone].filter((x) => x !== card);
      ZONES.forEach((z) => draft.zones[z].forEach((x) => { if (x.attachedTo === id) delete x.attachedTo; }));
      setTimeout(closeMenu);
    }, "danger"));
    menu.replaceChildren(...kids);
    menu.hidden = false;
    if (!el) return;
    const r = el.getBoundingClientRect(), m = menu.getBoundingClientRect();
    menu.style.left = Math.min(Math.max(8, r.left + r.width / 2 - m.width / 2), innerWidth - m.width - 8) + "px";
    menu.style.top = (r.bottom + m.height + 8 < innerHeight ? r.bottom + 6 : Math.max(8, r.top - m.height - 6)) + "px";
  }
  const closeMenu = () => { $("cr-menu").hidden = true; };
  document.addEventListener("pointerdown", (e) => {
    if (!$("cr-menu").hidden && !e.target.closest("#cr-menu") && !e.target.closest(".cr-card")) closeMenu();
  });

  /* ---------- play test, save, copy, clear ---------- */
  function buildPuzzle() {
    const strip = (card) => { const x = { ...card }; delete x.unmodeled; delete x.unread; return x; };
    const zone = (z) => (draft.zones[z] || []).map(strip);   // (the opponent has no hand zone)
    const side = (who) => ({ hand: zone(`${who}.hand`), battlefield: zone(`${who}.battlefield`), graveyard: zone(`${who}.graveyard`),
      exile: zone(`${who}.exile`), library: zone(`${who}.library`) });
    const you = side("you");
    if (draft.youLife != null) you.life = draft.youLife;
    const opp = side("opp");
    delete opp.hand;
    const p = puzzle({ id: "custom", title: draft.title || "My puzzle", difficulty: draft.difficulty, opp: { life: draft.oppLife, ...opp }, you });
    p.custom = true;
    return p;
  }

  $("cr-play").addEventListener("click", () => {
    const p = buildPuzzle();
    if (!p.player.hand.length && !p.player.battlefield.length) return status("Add some cards for yourself first.", "bad");
    closeMenu();
    app.play(p);
  });

  $("cr-save").addEventListener("click", () => {
    const saved = load(SAVED, []);
    const title = draft.title.trim() || `Untitled ${saved.length + 1}`;
    draft.title = title;
    const i = saved.findIndex((p) => p.title === title);
    if (i >= 0) saved[i] = JSON.parse(JSON.stringify(draft)); else saved.push(JSON.parse(JSON.stringify(draft)));
    store(SAVED, saved);
    save(); render();
    status(`Saved "${title}" in this browser.`, "ok");
  });

  $("cr-load").addEventListener("change", (e) => {
    const saved = load(SAVED, []);
    const p = saved[Number(e.target.value)];
    if (!p) return;
    draft = JSON.parse(JSON.stringify(p));
    fill();
    save(); render();
    status(`Loaded "${draft.title}". Save again to keep changes.`, "ok");
  });

  $("cr-clear").addEventListener("click", () => {
    if (!confirm("Clear the board and start a new puzzle? (Saved puzzles are kept.)")) return;
    draft = blank();
    attaching = null;
    closeMenu(); save(); render();
  });

  // The puzzle as an entry for puzzles.js: catalog cards as c("Name"), others with all their rules fields
  $("cr-copy").addEventListener("click", () => {
    const p = buildPuzzle();
    const cardCode = (card) => {
      const extra = { id: card.id };
      ["tapped", "sick", "counters", "attachedTo"].forEach((k) => { if (card[k] && (k !== "counters" || Object.keys(card[k]).length)) extra[k] = card[k]; });
      if (CARDS[card.name]) return `c(${JSON.stringify(card.name)}, ${JSON.stringify(extra)})`;
      const raw = { ...card };
      ["owner"].forEach((k) => delete raw[k]);
      return JSON.stringify(raw);
    };
    const list = (cards) => `[${cards.map(cardCode).join(", ")}]`;
    const slug = (draft.title || "my puzzle").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const youLife = draft.youLife != null ? `life: ${draft.youLife}, ` : "";
    const zones = (z) => `battlefield: ${list(z.battlefield)}, graveyard: ${list(z.graveyard)}, exile: ${list(z.exile)}, library: ${list(z.library)}`;
    const code = `puzzle({
  id: "${draft.difficulty}-${slug}", title: ${JSON.stringify(draft.title || "My puzzle")}, difficulty: "${draft.difficulty}",
  opp: { life: ${draft.oppLife}, ${zones(p.opponent)} },
  you: { ${youLife}hand: ${list(p.player.hand)}, ${zones(p.player)} },
  explanation: "",
  notes: \`
LETHAL:
RULES:
WRONG LINES:
UNIQUENESS: check with tools/solver.html\`
}),`;
    const done = () => status("Copied. Paste it into puzzles.js (or send it to Claude) to add the puzzle.", "ok");
    if (navigator.clipboard) navigator.clipboard.writeText(code).then(done, () => prompt("Copy the puzzle code:", code));
    else prompt("Copy the puzzle code:", code);
  });

  /* ---------- submitting (only a board you found lethal in yourself) ---------- */
  // What a play test must have won: the board, not the title or tier (so renaming doesn't need another test)
  const boardKey = (p) => JSON.stringify({ opp: p.opponent, you: p.player, landPlayed: p.landPlayed, prompt: p.prompt });
  const verifiedNow = () => !!(draft.verified && draft.verified.key === boardKey(buildPuzzle()));
  // the game reports a won play test with every move made: that's the solution sent along
  app.onCustomWin = (p, moves) => {
    draft.verified = { key: boardKey(p), steps: moves };
    save();
  };
  const AUTHOR = "find-lethal:author";
  const TIER_OK = ["easy", "medium", "hard"];

  // Why this board can't be sent yet ("" when it can)
  function submitProblem(p) {
    if (!window.Online || !window.Online.ready) return "Puzzle submissions aren't open yet.";
    if (!draft.title.trim()) return "Give your puzzle a title first.";
    const unmodeled = ZONES.flatMap((z) => draft.zones[z]).filter((x) => x.unmodeled);
    if (unmodeled.length) return `The game can't fully play ${unmodeled.map((x) => x.name).join(", ")}, so this puzzle can't be submitted.`;
    if (!verifiedNow()) return draft.verified ? "You changed the board after your play test: play-test it again and find lethal." :
      "Play-test your puzzle and find lethal first: only puzzles you solved yourself can be submitted.";
    if (!app.replayWins(p, { steps: draft.verified.steps })) return "Your saved winning line doesn't win anymore: play-test it again.";
    if (draft.submittedKey === draft.verified.key) return "You already sent this puzzle. Change it and play-test again to send a new version.";
    return "";
  }

  $("cr-submit-open").addEventListener("click", () => {
    closeMenu();
    const p = buildPuzzle();
    const why = submitProblem(p);
    if (why) return status(why, "bad");
    const n = draft.verified.steps.filter((m) => m.action.type !== "advance").length;
    $("cr-submit-note").textContent = `"${draft.title.trim()}" (${TIER_OK.includes(draft.difficulty) ? draft.difficulty : "hard"}). ` +
      `Your winning line (${n} step${n === 1 ? "" : "s"}) is sent along as the solution. A moderator looks at every puzzle before it ` +
      "goes into User submissions.";
    $("cr-author").value = load(AUTHOR, "");
    $("cr-submit-msg").textContent = "";
    $("cr-submit-send").disabled = false;
    $("cr-submit").hidden = false;
  });
  const closeSubmit = () => { $("cr-submit").hidden = true; };
  $("cr-submit-cancel").addEventListener("click", closeSubmit);
  $("cr-submit").addEventListener("click", (e) => { if (e.target === $("cr-submit")) closeSubmit(); });
  $("cr-submit-send").addEventListener("click", async () => {
    const p = buildPuzzle();
    const why = submitProblem(p);
    if (why) { $("cr-submit-msg").textContent = why; return; }
    const author = $("cr-author").value.trim().slice(0, 30);
    store(AUTHOR, author);
    const puzzleData = JSON.parse(JSON.stringify(p));
    delete puzzleData.custom;
    $("cr-submit-send").disabled = true;
    $("cr-submit-msg").textContent = "Sending…";
    try {
      await window.Online.submit({ title: draft.title.trim().slice(0, 40), author,
        tier: TIER_OK.includes(draft.difficulty) ? draft.difficulty : "hard", puzzle: puzzleData, solution: { steps: draft.verified.steps } });
      draft.submittedKey = draft.verified.key;
      save();
      closeSubmit();
      status(`Sent "${draft.title.trim()}"! If it's accepted, it shows up under User submissions.`, "ok");
    } catch (err) {
      $("cr-submit-send").disabled = false;
      $("cr-submit-msg").textContent = "Couldn't send it: " + err.message;
    }
  });

  app.onCreator = () => { closeMenu(); render(); };
  app.fromScryfall = fromScryfall;                           // the card reader, for tests
})();
