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
  // Puzzles players made in the creator and a moderator accepted (loaded from online.js after start)
  const USER_GROUP = { id: "user", label: "User puzzles", short: "Users", set: true, user: true };
  // One puzzle a day (dailies.js); a day's puzzle shows up once that date is reached on this device
  const DAILY_GROUP = { id: "daily", label: "Daily puzzles", short: "Daily", set: true, daily: true };
  const TIERS = { easy: "Easy", medium: "Medium", hard: "Hard" };
  const diffOf = (id) => DIFFS.find((d) => d.id === id) || (id === "user" ? USER_GROUP : id === "daily" ? DAILY_GROUP : { id, label: id });
  // today as "2026-11-01" (local time: a new daily appears at the player's midnight)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  // The set symbol, drawn in the text color (a mask, so it works in light and dark mode)
  const setIcon = (d) => {
    if (!d.icon) return null;
    const i = document.createElement("span");
    i.className = "set-icon";
    i.setAttribute("aria-hidden", "true");
    i.style.setProperty("--icon", `url("${d.icon}")`);
    return i;
  };
  // Each difficulty is its own linear set, in the order listed in puzzles.js; the dailies: the days reached so far,
  // newest first
  const setOf = (diff) => diff === "daily"
    ? window.PUZZLES.filter((p) => p.difficulty === "daily" && p.date <= today()).sort((a, b) => (a.date < b.date ? 1 : -1))
    : window.PUZZLES.filter((p) => p.difficulty === diff);

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

  /* ---------- stats for achievements (per-browser) ---------- */
  // got[achievement id]: when it was unlocked; seen: how many of them the player has looked at (the ribbon shows a
  // dot for the rest). (A stored "wins" count from before is ignored: wins are the different puzzles solved.)
  const STATS = "find-lethal:stats";
  const freshStats = () => ({ got: {}, seen: 0 });
  const stats = (() => {
    try { const { got, seen } = { ...freshStats(), ...(JSON.parse(localStorage.getItem(STATS) || "null") || {}) }; return { got, seen }; }
    catch (_) { return freshStats(); }
  })();
  const saveStats = () => { try { localStorage.setItem(STATS, JSON.stringify(stats)); } catch (_) { /* fine */ } };

  /* ---------- cheats (moderators only: switched on in the mod view, and only work while logged in there) ---------- */
  // Unlock every puzzle; show the Solution button in puzzles. Kept per browser.
  const CHEAT = "find-lethal:unlock-all", SOLUTION = "find-lethal:show-solution";
  let unlockAll = false, showSolution = false;
  try {
    unlockAll = localStorage.getItem(CHEAT) === "1";
    showSolution = localStorage.getItem(SOLUTION) === "1";
  } catch (_) { /* storage unavailable: no cheats */ }
  const keep = (key, on) => { try { if (on) localStorage.setItem(key, "1"); else localStorage.removeItem(key); } catch (_) { /* fine */ } };
  // the cheat switches in the mod view
  function renderCheats() {
    const toggle = (label, get, set) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "ghost small-btn cheat" });
      const paint = () => { b.textContent = `${label}: ${get() ? "on" : "off"}`; b.classList.toggle("on", get()); };
      b.onclick = () => { set(!get()); paint(); paintMod(); };
      paint();
      return b;
    };
    $("mod-cheats").replaceChildren(
      toggle("Unlock every puzzle", () => unlockAll, (v) => { unlockAll = v; keep(CHEAT, v); }),
      toggle("Solution button in puzzles", () => showSolution, (v) => { showSolution = v; keep(SOLUTION, v); }));
  }

  // (user submissions and dailies can be played in any order; the unlock cheat only for a logged-in moderator)
  const unlocked = (set, i) => (unlockAll && isMod()) || i === 0 || ["user", "daily"].includes(set[i].difficulty) || progress[set[i - 1].id] === "solved";

  $("clear-progress").addEventListener("click", () => {
    if (!confirm("Clear all puzzle progress and achievements? Every puzzle goes back to untried and locked.")) return;
    Object.keys(progress).forEach((id) => delete progress[id]);
    Object.assign(stats, freshStats());
    try {
      localStorage.removeItem(STORE);
      localStorage.removeItem("find-lethal:v1");   // or the old save would be migrated back in
      localStorage.removeItem(STATS);
    } catch (_) { /* storage unavailable: fine */ }
    paintRibbon();
    showMenu();
  });

  /* ---------- achievements ---------- */
  const RIBBON_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.6 13.9 7 22l5-3 5 3-1.6-8.1"/></svg>`;
  // (the sets' puzzles; user submissions have their own achievements)
  const allPuzzles = () => window.PUZZLES.filter((p) => DIFFS.some((d) => d.id === p.difficulty));
  // daily puzzles solved in a month ("2026-11"), from the saved progress (ids "daily-2026-11-05")
  const dailySolved = (month) => Object.keys(progress).filter((id) => id.startsWith(`daily-${month}-`) && progress[id] === "solved").length;
  const dailyMonths = [...new Set(window.PUZZLES.filter((p) => p.difficulty === "daily").map((p) => p.date.slice(0, 7)))].sort();
  const monthName = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
  const DAILY_STEPS = [[1, "Early Bird"], [7, "Regular"], [15, "Devotee"], ["all", "Perfect Month"]];
  const solvedIn = (list) => list.filter((p) => progress[p.id] === "solved").length;
  // user submissions solved: read from the saved progress, so it's right before they've loaded (and if one is removed)
  const userSolved = () => Object.keys(progress).filter((id) => id.startsWith("user-") && progress[id] === "solved").length;
  const WIN_NAMES = { 1: "First Blood", 10: "Combat Trick", 25: "Calculated Risk", 50: "Math Wizard", 100: "Lethal Weapon", 200: "Puzzle Master" };
  const USER_NAMES = { 1: "Guest Star", 10: "Open Mind", 25: "Fan Favorite", 100: "Community Pillar", 250: "Connoisseur", 500: "Hall of Fame", 1000: "Living Legend" };
  // count() against goal: unlocked once count reaches goal (bigger goals show a progress bar)
  const ACHIEVEMENTS = [
    ...[1, 10, 25, 50, 100, 200].map((n) => ({ id: `wins-${n}`, group: "Find lethal", name: WIN_NAMES[n],
      desc: n === 1 ? "Find lethal for the first time." : `Find lethal in ${n} different puzzles (replaying one doesn't count).`,
      count: () => solvedIn(allPuzzles()), goal: n })),
    ...DIFFS.map((d) => ({ id: `set-${d.id}`, group: "Sets", set: d, name: d.label,
      desc: `Solve every ${d.label} puzzle.`, count: () => solvedIn(setOf(d.id)), goal: setOf(d.id).length })),
    { id: "all", group: "Sets", name: "Multiverse Champion", desc: "Solve every puzzle in every set.",
      count: () => solvedIn(allPuzzles()), goal: allPuzzles().length },
    // per month of daily puzzles: solve 1, 7, 15 and all of that month's dailies
    ...dailyMonths.flatMap((m) => {
      const days = window.PUZZLES.filter((p) => p.difficulty === "daily" && p.date.startsWith(m)).length;
      return DAILY_STEPS.map(([n, title]) => ({ id: `daily-${m}-${n}`, group: "Daily puzzles", name: `${monthName(m)} ${title}`,
        desc: n === "all" ? `Solve every daily puzzle of ${monthName(m)} ${m.slice(0, 4)}.` : n === 1 ? `Solve a daily puzzle from ${monthName(m)} ${m.slice(0, 4)}.`
          : `Solve ${n} daily puzzles from ${monthName(m)} ${m.slice(0, 4)}.`,
        count: () => dailySolved(m), goal: n === "all" ? days : n }));
    }),
    ...[1, 10, 25, 100, 250, 500, 1000].map((n) => ({ id: `user-${n}`, group: "User puzzles", name: USER_NAMES[n],
      desc: n === 1 ? "Solve a puzzle made by another player." : `Solve ${n} puzzles made by other players.`,
      count: userSolved, goal: n }))
  ];
  const isDone = (a) => a.goal > 0 && a.count() >= a.goal;
  // (replays counted as wins in the first version: win milestones reached only that way are taken back)
  ACHIEVEMENTS.filter((a) => /^wins-/.test(a.id) && stats.got[a.id] && !isDone(a)).forEach((a) => { delete stats.got[a.id]; });
  stats.seen = Math.min(stats.seen, Object.keys(stats.got).length);
  saveStats();

  // Unlocks what's newly reached; returns those
  function checkAchievements() {
    const fresh = ACHIEVEMENTS.filter((a) => !stats.got[a.id] && isDone(a));
    fresh.forEach((a) => { stats.got[a.id] = Date.now(); });
    if (fresh.length) saveStats();
    paintRibbon();
    return fresh;
  }
  // The ribbon button: a dot while there are unlocked achievements the player hasn't looked at
  function paintRibbon() {
    const got = Object.keys(stats.got).length;
    $("ach-dot").hidden = got <= stats.seen;
    $("ach-open").title = `Achievements (${got} / ${ACHIEVEMENTS.length})`;
  }

  function showAchievements() {
    const got = ACHIEVEMENTS.filter((a) => stats.got[a.id]).length;
    $("ach-count").textContent = `${got} / ${ACHIEVEMENTS.length}`;
    const groups = [...new Set(ACHIEVEMENTS.map((a) => a.group))];
    $("ach-list").replaceChildren(...groups.flatMap((g) => [
      Object.assign(document.createElement("h3"), { textContent: g }),
      ...ACHIEVEMENTS.filter((a) => a.group === g).map((a) => {
        const done = !!stats.got[a.id];
        const row = document.createElement("div");
        row.className = "ach " + (done ? "got" : "locked");
        const ic = document.createElement("span");
        ic.className = "ach-ic";
        if (a.set) ic.append(setIcon(a.set)); else ic.innerHTML = RIBBON_SVG;
        const tx = document.createElement("div");
        tx.className = "ach-tx";
        tx.append(Object.assign(document.createElement("b"), { textContent: a.name }),
          Object.assign(document.createElement("small"), { textContent: a.desc }));
        if (!done && a.goal > 1) {
          const n = Math.min(a.count(), a.goal);
          const bar = document.createElement("div");
          bar.className = "ach-bar";
          bar.innerHTML = `<i></i><span></span>`;
          bar.querySelector("i").style.width = `${(100 * n) / a.goal}%`;
          bar.querySelector("span").textContent = `${n} / ${a.goal}`;
          tx.append(bar);
        }
        row.append(ic, tx);
        if (done) row.title = `Unlocked ${new Date(stats.got[a.id]).toLocaleDateString()}`;
        return row;
      })
    ]));
    $("achview").hidden = false;
    stats.seen = got;
    saveStats();
    paintRibbon();
  }
  const closeAchievements = () => { $("achview").hidden = true; };
  $("ach-open").addEventListener("click", showAchievements);
  $("ach-close").addEventListener("click", closeAchievements);
  $("achview").addEventListener("click", (e) => { if (e.target === $("achview")) closeAchievements(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("achview").hidden) closeAchievements(); });

  /* ---------- screens: menu → levels → game ---------- */
  let current = null;   // the puzzle definition being played

  function show(screen) {
    document.body.dataset.screen = screen;
    paintMod();                                              // (the Edit button only for a logged-in moderator)
    $("zoneview").hidden = true;
    if (screen !== "game") $("stackview").hidden = $("stack-show").hidden = true;   // (the stack popup belongs to a game)
    const back = $("back");
    back.hidden = screen === "menu";
    back.textContent = screen !== "game" ? "← Menu" : current && current.tutorial ? "← Menu" : current && current.reviewing ? "← Mod view" : current && current.custom ? "← Creator" : "← Puzzles";
    $("sheet").hidden = true;
    window.scrollTo(0, 0);
  }

  // A big menu button: label, a line under it, and what it opens
  function menuButton(cls, label, sub, onclick, icon) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "diff-btn " + cls;
    b.innerHTML = `<span class="dl"></span><span class="dc"></span>`;
    b.querySelector(".dl").textContent = label;
    if (icon) b.querySelector(".dl").prepend(icon);
    b.querySelector(".dc").textContent = sub;
    b.onclick = onclick;
    return b;
  }
  const solvedCount = (set) => set.filter((p) => progress[p.id] === "solved").length;

  // The main menu: Daily puzzles (on top), Set puzzles, User puzzles
  function showMenu() {
    const days = setOf("daily");
    const todays = days.find((p) => p.date === today());
    const official = allPuzzles();
    const users = setOf("user");
    $("home-list").replaceChildren(
      menuButton("home daily", "Daily puzzles", todays ? (progress[todays.id] === "solved" ? "Today's puzzle: solved ✓" : "Today's puzzle is ready")
        : "Coming soon", () => showLevels("daily")),
      menuButton("home sets", "Set puzzles", `${solvedCount(official)} / ${official.length} solved · ${DIFFS.length} sets`, showSets),
      ...(window.Online && window.Online.ready
        ? [menuButton("home user", "User puzzles", users.length ? `${solvedCount(users)} / ${users.length} solved` : userState, () => showLevels("user"))] : []));
    $("home-list").querySelectorAll("button").forEach((b, i) => { if (i === 0) b.disabled = !days.length; if (i === 2) b.disabled = !users.length; });
    show("menu");
  }

  // Set puzzles: one button per set
  function showSets() {
    $("diff-list").replaceChildren(...DIFFS.map((d) => {
      const set = setOf(d.id);
      const b = menuButton(d.id + " set", d.label, set.length ? `${solvedCount(set)} / ${set.length} solved` : "Coming soon", () => showLevels(d.id), setIcon(d));
      b.disabled = !set.length;
      return b;
    }));
    show("sets");
  }

  // The accepted user submissions, as puzzles of the "user" group (they come with the creator's winning line)
  let userState = "Loading…";
  async function loadUserPuzzles() {
    if (!window.Online || !window.Online.ready) return;
    try {
      const rows = await window.Online.accepted();
      window.PUZZLES = window.PUZZLES.filter((p) => p.difficulty !== "user");
      rows.forEach((r) => window.PUZZLES.push(userPuzzle(r)));
      userState = rows.length ? "" : "None yet";
    } catch (_) { userState = "Couldn't load (offline?)"; }
    if (document.body.dataset.screen === "menu") showMenu();
    checkAchievements();
  }
  const userPuzzle = (r) => ({ ...r.puzzle, id: `user-${r.id}`, title: r.title, difficulty: "user", tier: r.tier,
    author: r.author || "", solution: r.solution, custom: false });

  const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

  function showLevels(diff) {
    const set = setOf(diff);
    levelsOf = diff;
    const title = $("levels-title");
    const d = diffOf(diff);
    title.textContent = d.label;
    if (d.icon) title.prepend(setIcon(d));
    title.className = "levels-title " + diff;
    // (daily puzzles: newest first, under a heading per month, each tile showing its day)
    $("grid").replaceChildren(...set.flatMap((p, i) => {
      const open = unlocked(set, i);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tile " + (open ? progress[p.id] || "new" : "locked") + (p.tier ? " tier-" + p.tier : "");
      if (open) b.textContent = p.date ? Number(p.date.slice(8, 10)) : i + 1; else b.innerHTML = LOCK_SVG;
      if (p.date && p.date === today()) b.classList.add("today");
      const month = p.date && p.date.slice(0, 7);
      if (month && (i === 0 || set[i - 1].date.slice(0, 7) !== month)) {
        return [Object.assign(document.createElement("h3"), { className: "grid-month", textContent: `${monthName(month)} ${month.slice(0, 4)}` }), finishTile(b, p, i, open)];
      }
      return [finishTile(b, p, i, open)];
    }));
    show("levels");
    $("back").textContent = DIFFS.some((d) => d.id === diff) ? "← Sets" : "← Menu";
  }
  let levelsOf = null;                                       // (the group whose grid is showing)
  // A grid tile's tooltip, label and click
  function finishTile(b, p, i, open) {
    b.title = open ? `${p.title}${p.tier ? " (" + TIERS[p.tier] + ")" : ""}` : "Solve the previous puzzle first";
    b.setAttribute("aria-label", (p.date ? p.title : `Puzzle ${i + 1}`) + (p.tier ? `, ${TIERS[p.tier]}` : "") + (open ? (p.date ? "" : `: ${p.title}`) : " (locked)"));
    if (!open) b.setAttribute("aria-disabled", "true");   // still clickable, to show it's locked
    b.onclick = () => (open ? play(p) : refuse(b));
    return b;
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
  const leaveGame = () => (current.tutorial ? finishTutorial() : current.reviewing ? showMod() : current.custom ? showCreator() : showLevels(current.difficulty));

  /* ---------- puzzle creator (creator.js) ---------- */
  // (mod: the mod view's creator, which can also edit the game's puzzles; back from it goes to the mod view)
  let creatorMod = false;
  function showCreator(mod = creatorMod) {
    creatorMod = mod === true;
    show("creator");
    $("back").textContent = creatorMod ? "← Mod view" : "← Menu";
    if (window.FindLethal.onCreator) window.FindLethal.onCreator({ mod: creatorMod });
  }
  $("open-creator").addEventListener("click", () => showCreator(false));

  /* ---------- mod view (?mod): review submitted puzzles, the mod creator, cheats ---------- */
  // Only a logged-in moderator gets submissions from the server (the database checks it, not this page).
  let modTab = "pending";
  const TRASH_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>`;
  function showMod() {
    show("mod");
    paintMod();                                                // (just logged in or out: the Edit button follows)
    renderCheats();
    const on = window.Online && window.Online.ready;
    $("mod-setup").hidden = on;
    $("mod-login").hidden = !on || window.Online.loggedIn();
    $("mod-panel").hidden = !on || !window.Online.loggedIn();
    if (on && window.Online.loggedIn()) loadMod();
  }
  const modMsg = (t, bad = false) => { $("mod-msg").textContent = t; $("mod-msg").className = "cr-status " + (bad ? "bad" : ""); };
  $("mod-login-btn").addEventListener("click", async () => {
    $("mod-login-msg").textContent = "Logging in…";
    try {
      await window.Online.login($("mod-email").value.trim(), $("mod-pass").value);
      $("mod-pass").value = ""; $("mod-login-msg").textContent = "";
      showMod();
    } catch (err) { $("mod-login-msg").textContent = "Couldn't log in: " + err.message; }
  });
  $("mod-logout").addEventListener("click", () => { window.Online.logout(); showMod(); });
  // the mod view's own puzzle creator: new puzzles, and editing any puzzle in the game
  $("mod-creator").addEventListener("click", () => showCreator(true));
  document.querySelectorAll("#mod-tabs button").forEach((b) => b.addEventListener("click", () => { modTab = b.dataset.tab; loadMod(); }));

  async function loadMod() {
    document.querySelectorAll("#mod-tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === modTab));
    modMsg("Loading…");
    $("mod-list").replaceChildren();
    let rows;
    try { rows = await window.Online.list(modTab); } catch (err) {
      if (!window.Online.loggedIn()) return showMod();          // (the login ran out)
      return modMsg("Couldn't load: " + err.message, true);
    }
    modMsg(rows.length ? "" : `No ${modTab} submissions.`);
    $("mod-list").replaceChildren(...rows.map(modItem));
  }

  function modItem(r) {
    const el = document.createElement("div");
    el.className = "mod-item";
    const def = { ...r.puzzle, id: "review-" + r.id, title: r.title, custom: true, reviewing: true };
    const ok = replayWins(def, r.solution);
    const cards = [def.player.hand, def.player.battlefield, def.opponent.battlefield].flat().length;
    const head = document.createElement("div");
    head.className = "mod-head";
    head.append(Object.assign(document.createElement("b"), { textContent: r.title }),
      Object.assign(document.createElement("span"), { className: "mod-badge " + (ok ? "ok" : "bad"),
        textContent: ok ? "✓ Solution checked" : "✗ Solution doesn't win" }));
    const meta = Object.assign(document.createElement("small"), {
      textContent: `by ${r.author || "anonymous"} · ${new Date(r.created_at).toLocaleString()} · opponent at ${def.opponent.life} life · ${cards} cards` });
    const steps = document.createElement("details");
    steps.append(Object.assign(document.createElement("summary"), { textContent: "The creator's winning line" }),
      Object.assign(document.createElement("pre"), { textContent: solutionText(r.solution) }));
    const tier = document.createElement("select");
    tier.setAttribute("aria-label", "Tier");
    Object.entries(TIERS).forEach(([v, label]) => tier.append(new Option(label, v, false, v === r.tier)));
    const btn = (label, cls, fn) => { const b = Object.assign(document.createElement("button"), { type: "button", className: cls, textContent: label }); b.onclick = fn; return b; };
    const review = (status) => async () => {
      try {
        await window.Online.review(r.id, { status, tier: tier.value });
        toast(status === "accepted" ? "Accepted: it's in User submissions" : status === "declined" ? "Declined" : "Moved back to pending");
        loadMod();
        loadUserPuzzles();
      } catch (err) { modMsg("Couldn't save: " + err.message, true); }
    };
    const actions = document.createElement("div");
    actions.className = "mod-actions";
    actions.append(tier, btn("Play", "ghost", () => play(def)));
    if (r.status !== "declined") actions.append(btn("Decline", "ghost danger", review("declined")));
    if (r.status !== "pending") actions.append(btn("Back to pending", "ghost", review("pending")));
    if (r.status !== "accepted") actions.append(btn("Accept", "primary", review("accepted")));
    // a declined puzzle can be deleted for good
    if (r.status === "declined") {
      const del = btn("", "ghost mod-delete", async () => {
        if (!confirm(`Delete "${r.title}" for good? This can't be undone.`)) return;
        try { await window.Online.remove(r.id); toast("Deleted"); loadMod(); } catch (err) { modMsg("Couldn't delete: " + err.message, true); }
      });
      del.innerHTML = TRASH_SVG;
      del.title = "Delete for good";
      del.setAttribute("aria-label", `Delete ${r.title}`);
      actions.append(del);
    }
    el.append(head, meta, steps, actions);
    return el;
  }

  $("back").addEventListener("click", () => {
    const screen = document.body.dataset.screen;
    if (screen === "game") leaveGame();
    else if (screen === "creator" && creatorMod) showMod();
    else if (screen === "levels" && DIFFS.some((d) => d.id === levelsOf)) showSets();   // (a set's grid: back to the sets)
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
  window.FindLethal = { cardEl: (c) => cardEl(c, { detached: true }), play: (p) => play(p), menu: () => showMenu(),
    replayWins: (p, sol) => replayWins(p, sol), groupLabel: (id) => diffOf(id).label };
  // (moderators only) open the puzzle being played in the mod view's creator, to tweak it
  $("edit-puzzle").addEventListener("click", () => {
    if (!isMod()) return;
    if (!current || current.custom) return showCreator(true);
    showCreator(true);
    if (!window.FindLethal.editPuzzle(current)) play(current);   // (said no to replacing the board: back to the puzzle)
  });
  // logged in as a moderator (this browser): the Edit button shows in puzzles
  function isMod() { return !!(window.Online && window.Online.ready && window.Online.loggedIn()); }
  function paintMod() {
    document.body.classList.toggle("is-mod", isMod());
    document.body.classList.toggle("show-solution", isMod() && showSolution);   // (the Solution button: a moderator's cheat)
  }

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
  // Basic lands show the art of the puzzle's set ("&set=fra": that set's printing)
  const BASICS = ["Plains", "Island", "Swamp", "Mountain", "Forest", "Wastes"];
  const loadedArt = new Map();             // card image URL → the address it loaded from (after redirects/fallbacks)
  // its set code, if any (a daily puzzle has the set its cards come from)
  const puzzleSet = () => (current && current.artSet) || (current && diffOf(current.difficulty).icon ? current.difficulty : null);
  const basicSet = (name) => (BASICS.includes(name) && puzzleSet() ? "&set=" + puzzleSet() : "");

  function cardEl(c, { zoom = false, detached = false } = {}) {
    const el = document.createElement("div");
    el.className = "card" + (c.tapped && !zoom ? " tapped" : "") + (c.token ? " token" : "") + (c.faceDown ? " facedown" : "") +
      (!c.faceDown && /\bSaga\b/.test(c.type || "") ? " saga" : "");   // (a Saga's chapters are on the left: its counters go right)
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
    // (first strike isn't shown next to double strike: double strike already deals first-strike damage, CR 702.4c-d)
    const doubleStrike = E.has(c, "double strike");
    const gainedKw = ((c.st && c.st.kw) || []).filter((k) => !(c.kw || []).includes(k) && !(doubleStrike && k === "first strike"));
    if (c.st && c.st.lost) gainedKw.unshift("no abilities");
    // designations: suspected, saddled, a solved Case
    if (c.suspected) gainedKw.unshift("suspected");
    if (c.saddled) gainedKw.unshift("saddled");
    if (c.solved) gainedKw.unshift("solved");
    if (c.levels) gainedKw.unshift(`level ${c.level || 1}`);       // a Class's level
    if (c.exhausted && c.exhausted.length) gainedKw.unshift("exhaust used");   // its exhaust ability was activated
    if (c.prepared) gainedKw.unshift("prepared");                  // it may cast a copy of its prepare spell
    // (a Room's locked doors show as locks over their art, below)
    if (gainedKw.length) {
      const k = document.createElement("div");
      k.className = "kwchips";
      k.textContent = [...new Set(gainedKw)].join(" · ");
      el.appendChild(k);
    }

    // A Room on the battlefield: a lock over the art of each locked door (the card's halves are printed sideways:
    // door 1 is the top half of the upright image, door 0 the bottom half; the rules text stays readable)
    if (c.layout === "room" && c.unlocked && !c.faceDown) {
      c.unlocked.forEach((open, i) => {
        if (open) return;
        const lock = document.createElement("div");
        lock.className = "doorlock d" + i;
        lock.title = `${c.faces[i].name}: locked`;
        lock.innerHTML = LOCK_SVG;
        el.appendChild(lock);
      });
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
        // a power-up or exhaust cost that's lower right now (entered this turn, Hulk, Boom Scholar): say what it costs now
        if ((ab.powerUp || ab.exhaust) && state && !detached && state.player.battlefield.includes(c)) {
          const now = E.abilityCost(state, c, ab);
          if (now !== ab.cost) b.textContent = `${now ? `Now ${now}` : "Free now"} · ${b.textContent}`;
        }
        b.title = `Activate: ${ab.text || "ability"}`;
        box.appendChild(b);
      });
      el.appendChild(box);
    }

    if (c.faceDown) return el;                                   // (a face-down card shows its card back)
    // Tokens: art from Scryfall's token printings, the puzzle's set first (looked up by name alone, "Treasure" could
    // find an unrelated card). A token Scryfall has no printing of keeps its text face.
    if (c.token && !c.image) {
      const url = tokenArt(c);
      if (url) showArt(el, face, url);
      return el;
    }
    // (a transformed double-faced card shows its back face: looked up by the front face's name)
    showArt(el, face, c.image || (c.transformed && c.faces ? scry(c.faces[0].name) + "&face=back" : scry(c.name) + basicSet(c.name)),
      scry(c.name));
    return el;
  }

  // Puts a card's image over its text face once it loads (fallback: another address to try if that one fails)
  function showArt(el, face, url, fallback) {
    const img = new Image();
    img.alt = "";
    img.draggable = false;
    // an image that loaded before is shown straight away: every redraw rebuilds the board, and waiting for the load
    // event again flashed each card's text face for a frame (on big desktop cards the whole board flickered)
    const known = loadedArt.get(url);
    if (known) {
      img.decoding = "sync";
      img.src = known;
      face.remove();
      el.prepend(img);
      return;
    }
    img.onload = () => { loadedArt.set(url, img.src); face.remove(); el.prepend(img); };
    img.onerror = () => { if (fallback && img.src !== fallback && url.includes("&set=")) img.src = fallback; };   // (no basic in that set: any printing)
    img.src = url;
  }

  /* ---------- token art ---------- */
  // tokenart.js (made by tools/token-art.ps1) has Scryfall's token printings: "name|power/toughness|colors" → the
  // image from each set's token set ("t" + its code) and "*" from any set. The puzzle's set comes first.
  // (a token whose power/toughness is worked out in play, like a Spirit X/X, is listed as "name||colors")
  function tokenArt(c) {
    const art = window.TOKEN_ART || {};
    const colors = [...(c.colors || [])].sort().join("");
    const e = art[`${c.name}|${c.pt || ""}|${colors}`] || art[`${c.name}||${colors}`];
    return e ? e[puzzleSet()] || e["*"] : null;
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
    moves = [];
    if (current.tutorial) tutorialLoaded();
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
    $("puzzle-title").textContent = current.custom || current.date ? current.title : `#${setOf(current.difficulty).indexOf(current) + 1} · ${current.title}`;

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
    const adventures = p.player.exile.filter((c) => c.onAdventure || c.playable || c.plotted || c.airbent);
    // (and graveyard cards with harmonize, cast from there, or renew, an ability used from there)
    const flashbacks = p.player.graveyard.filter((c) => c.flashback || c.harmonize || c.renew || (c.mayhem && c.discardedThisTurn));
    // a prepared creature's prepare spell: a copy you may cast (shown with your hand)
    const prepared = p.player.battlefield.filter((c) => c.prepared && c.prepare)
      // (shown as its creature's card: the prepare spell is printed on it)
      .map((c) => ({ ...c.prepare, id: `${c.id}#prep`, token: true, image: scry(c.name), text: c.prepare.text, preparedFrom: c.name }));
    fill($("hand"), [...hand, ...adventures, ...flashbacks, ...prepared]);
    const mark = (c, label) => {
      const el = document.querySelector(`#hand .card[data-id="${c.id}"]`);
      if (el) { el.classList.add("adventure"); el.append(Object.assign(document.createElement("div"), { className: "attachchip", textContent: label })); }
    };
    adventures.forEach((c) => mark(c, c.plotted ? (c.plottedNow ? "Plotted (cast it free on a later turn)" : "Plotted: cast it free (main phase)")
      : c.playable ? "Exiled: you may play it this turn" : c.airbent ? "Airbent: cast it for {2}" : "On an adventure (exile)"));
    prepared.forEach((c) => mark(c, `Prepared (${c.preparedFrom}): cast a copy`));
    flashbacks.forEach((c) => mark(c, c.flashback ? `Flashback ${c.flashback.cost} (graveyard)` : c.harmonize ? `Harmonize ${c.harmonize} (graveyard)`
      : c.renew ? `Renew ${c.renew.cost} (graveyard)` : `Mayhem ${c.mayhem} (graveyard)`));
    $("hand-count").textContent = `${hand.length} card${hand.length === 1 ? "" : "s"} in hand` +
      (adventures.length ? ` · ${adventures.length} on an adventure` : "") + (flashbacks.length ? ` · ${flashbacks.length} usable from the graveyard` : "") +
      (prepared.length ? ` · ${prepared.length} prepared spell${prepared.length === 1 ? "" : "s"}` : "");
    // (shown whenever something can be cast from it: a prepared spell's copy too, even with an empty hand)
    $("hand-wrap").classList.toggle("empty", !hand.length && !adventures.length && !flashbacks.length && !prepared.length);
    showPhase(p.phase);
    const floating = p.pool.length + (p.firePool || 0);              // (firebending {R}s last until end of combat)
    $("pool").textContent = floating ? `${floating} mana floating` : "";
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
    // (a prepared spell's copy in your hand, "<id>#prep": its creature's card, where the spell is printed)
    const id = el.dataset.id.replace(/#prep$/, "");
    const all = [].concat(
      state.opponent.battlefield, state.player.battlefield, state.player.hand,
      state.opponent.graveyard, state.player.graveyard, state.opponent.exile, state.player.exile,
      state.player.library || [], state.opponent.library || []      // (the library viewer's known cards)
    );
    return all.find((c) => c.id === id) || null;
  }

  function showZoom(card) {
    tutorialSaw("zoom");
    const z = $("zoom");
    // a double-faced card shows both faces next to each other, front first (the face that's up keeps its counters etc.)
    const dfc = !card.faceDown && card.faces && card.faces.length === 2 && ["transform", "modal_dfc"].includes(card.layout);
    // printed sideways: a battle's face and split cards like Rooms (turned so they read left to right)
    const sideways = (face) => !card.faceDown && (["room", "split"].includes(card.layout) || /\bbattle\b/i.test((face && face.type) || ""));
    const slot = (el, face) => {
      const s = document.createElement("div");
      s.className = "zslot" + (sideways(face) ? " side" : "");
      s.append(el);
      return s;
    };
    let slots;
    if (dfc) {
      const up = card.transformed ? 1 : 0;
      const f = card.faces[1 - up];
      const other = slot(cardEl({ ...f, name: f.name || card.name, faces: card.faces, layout: card.layout, transformed: up === 0, colors: f.colors || card.colors }, { zoom: true, detached: true }), f);
      const shown = slot(cardEl(card, { zoom: true }), card.faces[up]);
      slots = up ? [other, shown] : [shown, other];
    } else slots = [slot(cardEl(card, { zoom: true }), card)];
    z.replaceChildren(...slots);
    z.classList.toggle("pair", !!dfc);
    z.classList.toggle("side", slots.some((s) => s.classList.contains("side")));
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
    tutorialSaw("zone");
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
    const from = E.castable(state, el.dataset.id) ||            // your hand, or an Adventure card waiting in exile
      ((g) => (g && g.renew ? { card: g, zone: "graveyard", renew: true } : null))(state.player.graveyard.find((c) => c.id === el.dataset.id));
    if (!from) return;
    const card = from.card;
    if (casting && casting.card && casting.card.id === card.id) {
      if (el.classList.contains("targetable")) return void choose(card.id);   // targeting itself
      cancelCast(); setPrompt(current.prompt); return;
    }
    if (casting && casting.trigger) return;                   // a trigger or scry is waiting for you
    cancelCast();
    clearAttackers();
    casting = { card, face: from.zone === "exile" && card.onAdventure ? 0 : card.faces ? undefined : null, results: [], picks: [],
      ...(from.renew ? { renew: true } : {}), ...(from.zone === "graveyard" && card.harmonize && !card.flashback ? { harmonize: true } : {}) };
    el.classList.add("selected", "casting");
    nextChoice();
  });

  const ONE = { min: 1, max: 1 };
  const combos = (list, k) => (k === 0 ? [[]] : list.flatMap((x, i) => combos(list.slice(i + 1), k - 1).map((c) => [x, ...c])));
  // (cast using teamwork: its teamwork version — "choose both instead", or the stronger effect)
  const faceNow = () => {
    const f = E.faceOf(casting.card, { face: casting.face ?? undefined });
    if (!(f.teamwork && casting.teamwork)) return f;
    return { ...f, ...(f.ifTeamwork || {}), ...(f.teamworkBoth && f.modes ? { chooseCount: f.modes.length } : {}) };
  };
  const faceOk = (card, face) => {
    const f = E.faceOf(card, { face });
    return !E.check(state, E.isLand(f) ? { type: "play", id: card.id, face } : { type: "cast", id: card.id, face });
  };

  // Walk a spell through its choices: face → mode(s) → color → X → sacrifice → targets (in groups) → split → cast.
  // Abilities: X → targets. Waiting triggers: targets.
  function nextChoice() {
    if (casting.trigger) return targetPhase();
    // an ability that discards this card from your hand ("{1}{R}, Discard this card: …"): cast it, or use that
    if (casting.card.handAbility && casting.channel === undefined && state.player.hand.includes(casting.card)) {
      const card = casting.card, canUse = !E.check(state, { type: "channel", id: card.id }), canCast = !E.check(state, { type: "cast", id: card.id });
      if (canUse && canCast) return askChoice(`${card.name}: cast it, or discard it for its ability?`,
        [[false, `Cast ${card.name} (${card.cost})`], [true, `Discard it: ${card.handAbility.cost} — its ability`]], (v) => { casting.channel = v; nextChoice(); });
      casting.channel = canUse && !canCast;
    }
    if (casting.channel) {
      const h = casting.card.handAbility;
      casting.phases = casting.phases || (h.targets ? [{ kind: h.targets, filter: h.filter, count: ONE, src: casting.card, label: `${casting.card.name}'s ability` }] : []);
      return targetPhase();
    }
    // renew: an ability of a card in your graveyard (it's exiled as you activate it); its target
    if (casting.renew) {
      const why = E.check(state, { type: "renew", id: casting.card.id });
      if (why) { cancelCast(); return rulesNote(why); }
      const r = casting.card.renew;
      casting.phases = casting.phases || [{ kind: r.targets, filter: r.filter, count: ONE, src: casting.card, label: `${casting.card.name}'s renew` }];
      return targetPhase();
    }
    const { card } = casting;
    const again = (key) => (v) => { casting[key] = v; nextChoice(); };
    if (casting.index != null) {
      const ab = E.abilitiesOf(card)[casting.index];
      if (E.parseCost(ab.cost).x && casting.x == null) {
        const max = E.manaAvailable(state, ab.tap ? [card.id] : []) - E.manaValue(ab.cost);
        if (max < 1) { cancelCast(); return rulesNote("Not enough mana."); }
        return askChoice(`${card.name}: choose X`, Array.from({ length: max }, (_, i) => [i + 1, String(i + 1)]), again("x"));
      }
      // waterbend: which of your untapped artifacts and creatures help pay (one generic mana each)
      if (ab.waterbend && casting.waterTap === undefined) {
        const base = { type: "activate", id: card.id, index: casting.index, target: firstTarget(card, casting.index) };
        const sets = E.subsets(state.player.battlefield.filter((c) => (E.isCreature(c) || /artifact/i.test(c.type || "")) && !c.tapped && !(ab.tap && c.id === card.id)).map((c) => c.id))
          .filter((l) => !E.check(state, { ...base, waterTap: l }));
        const same = (x, y) => x.length === y.length && x.every((id) => y.includes(id));
        if (sets.length === 1 && !sets[0].length) casting.waterTap = [];
        else return pickCards({ ids: [...new Set(sets.flat())], min: 0, max: Math.max(...sets.map((l) => l.length)),
          prompt: `Waterbend ${ab.cost}: tap your artifacts and creatures to help pay (each pays {1}), or pay with mana.`,
          confirm: (l) => (l.length ? `Waterbend (${l.length})` : "Mana only"), complete: (l) => sets.some((set) => same(set, l)),
          canAdd: (l) => sets.some((set) => l.every((x) => set.includes(x))), then: (l) => again("waterTap")(l) });
      }
      // "{T}, Blight 1: …": which creature of yours gets the -1/-1 counter
      if (ab.blight && casting.blight === undefined) {
        return pickCards({ ids: E.blightOptions(state), confirm: `Blight ${ab.blight}`,
          prompt: `Choose a creature you control to blight ${ab.blight} for ${card.name}'s ability.`, then: (picked) => again("blight")(Array.isArray(picked) ? picked[0] : picked) });
      }
      // "Discard a card: …": which card
      if (ab.discardCost && casting.discard === undefined) {
        return pickCards({ ids: state.player.hand.map((c) => c.id), confirm: "Discard",
          prompt: `Discard a card from your hand for ${card.name}'s ability.`, then: (picked) => again("discard")(Array.isArray(picked) ? picked[0] : picked) });
      }
      // station: tap one other untapped creature; it puts charge counters equal to its power on this permanent
      if (ab.stationAb && casting.crew === undefined) {
        return pickCards({ ids: crewIds(card), min: 1, max: 1, confirm: "Station",
          prompt: `Station: tap another untapped creature you control. ${card.name} gets charge counters equal to its power (a creature at ${card.station.at}+).`,
          then: (l) => again("crew")(l) });
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
            return [a.craft, `${c ? c.name : a.craft}${onField ? "" : " (graveyard)"}`, c];
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
    // warp (a card in your hand): cast it normally, or for its warp cost
    if (card.warp && casting.warp === undefined && state.player.hand.includes(card)) {
      const canWarp = !E.check(state, { type: "cast", id: card.id, warp: true });
      const canCast = !E.check(state, { type: "cast", id: card.id });
      if (canWarp && canCast) return askChoice(`${card.name}: how do you cast it?`, [[false, `Cast ${card.name} (${card.cost})`], [true, `Warp it for ${card.warp} (exiled at the next end step)`]], again("warp"));
      casting.warp = canWarp && !canCast;
    }
    // sneak (in your declare blockers step): return an unblocked attacker of yours and pay the sneak cost
    if (card.sneak && casting.sneak === undefined && state.player.hand.includes(card)) {
      const ids = (state.combat && state.combat.blocks ? state.combat.attackers : []).filter((id) => !E.check(state, { type: "cast", id: card.id, sneak: id }));
      const normal = !E.check(state, { type: "cast", id: card.id });
      if (!ids.length) casting.sneak = null;
      else return pickCards({ ids, confirm: "Return it", alt: normal ? { label: `Cast normally (${card.cost})`, value: null } : null,
        prompt: `Sneak ${card.sneak}: return an unblocked attacking creature you control to its owner's hand.`,
        then: (picked) => again("sneak")(Array.isArray(picked) ? picked[0] : picked) });
    }
    // web-slinging (a card in your hand): return a tapped creature of yours and pay less, or cast it normally
    if (card.webSlinging && casting.webSling === undefined && state.player.hand.includes(card)) {
      const ids = state.player.battlefield.filter((c) => E.isCreature(c) && c.tapped).map((c) => c.id).filter((id) => !E.check(state, { type: "cast", id: card.id, webSling: id }));
      const normal = !E.check(state, { type: "cast", id: card.id });
      if (!ids.length) casting.webSling = null;
      else return pickCards({ ids, confirm: "Return it", alt: normal ? { label: `Cast normally (${card.cost})`, value: null } : null,
        prompt: `Web-slinging ${card.webSlinging}: return a tapped creature you control to its owner's hand.`,
        then: (picked) => again("webSling")(Array.isArray(picked) ? picked[0] : picked) });
    }
    if (casting.cycle) {
      const a = { type: "cycle", id: card.id };
      const why = E.check(state, a);
      cancelCast();
      return why ? rulesNote(why) : perform(a);
    }
    // harmonize (cast from the graveyard): you may tap one of your untapped creatures to reduce the cost by its power
    if (casting.harmonize && casting.tapFor === undefined) {
      const base0 = { type: "cast", id: card.id };
      const ids = E.convokeHelpers(state).filter((id) => !E.check(state, { ...base0, tapFor: id }));
      const plain = !E.check(state, base0);
      if (!ids.length && !plain) { cancelCast(); return rulesNote(E.check(state, base0) || "Not enough mana."); }
      if (!ids.length) casting.tapFor = null;
      else return pickCards({ ids, confirm: "Tap it", alt: plain ? { label: "Don't tap a creature", value: null } : null,
        prompt: `Harmonize ${card.harmonize}: you may tap a creature you control to reduce the cost by its power.`,
        then: (picked) => again("tapFor")(Array.isArray(picked) ? picked[0] : picked) });
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
    const why = E.check(state, { type: "cast", id: card.id, face: casting.face ?? undefined, evidence: casting.evidence ?? undefined, tapFor: casting.tapFor ?? undefined, warp: casting.warp || undefined, webSling: casting.webSling ?? undefined, sneak: casting.sneak ?? undefined });
    if (why) { cancelCast(); return rulesNote(why); }
    // teamwork N (optional): tap your untapped creatures with total power N or more
    if (f.teamwork && casting.teamwork === undefined) {
      const ids = E.convokeHelpers(state);
      const pw = (l) => l.reduce((t, id) => t + Math.max(E.power(state.player.battlefield.find((c) => c.id === id)), 0), 0);
      if (pw(ids) < f.teamwork) casting.teamwork = null;
      else return pickCards({ ids, min: 1, max: ids.length, alt: { label: "Cast without teamwork", value: null },
        prompt: `Teamwork ${f.teamwork}: tap your creatures with ${f.teamwork} or more total power, or cast it without teamwork.`,
        confirm: (l) => `Teamwork (${pw(l)} power)`, complete: (l) => pw(l) >= f.teamwork,
        then: (picked) => { casting.teamwork = Array.isArray(picked) && picked.length ? picked : null; nextChoice(); } });
    }
    const fT = faceNow();
    const n = fT.chooseCount || 1;
    if (f.modes && casting.mode == null) {
      // spree: one or more modes, each adding its cost (only the combinations you can pay for and target are offered)
      const ids = f.modes.map((_, i) => i);
      // (checked with the way it's being cast: sneak, warp or web-slinging change what it costs)
      const how = { face: casting.face ?? undefined, evidence: casting.evidence ?? undefined, tapFor: casting.tapFor ?? undefined, warp: casting.warp || undefined,
        webSling: casting.webSling ?? undefined, sneak: casting.sneak ?? undefined };
      const opts = f.spree
        ? E.subsets(ids).filter((l) => l.length && !E.check(state, { type: "cast", id: card.id, mode: l, ...how }))
          .map((l) => [l, l.map((i) => `${f.modes[i].plus ? f.modes[i].plus + " " : ""}${f.modes[i].text}`).join(" + ")])
        : n > 1 ? combos(ids, n).map((c) => [c, c.map((i) => f.modes[i].text).join(" + ")])
        // (tiered: each mode with its additional cost, only the ones you can pay for)
        : f.tiered ? f.modes.map((m, i) => [i, `${m.plus} — ${m.text}`]).filter(([i]) => !E.check(state, { type: "cast", id: card.id, mode: i, ...how }))
        : f.modes.map((m, i) => [i, m.text || `Mode ${i + 1}`]);
      if (!opts.length) { cancelCast(); return rulesNote(`Not enough mana for any mode of ${f.name}.`); }
      const choose = f.oneOrMore ? "choose one or more" : f.spree ? "choose one or more (spree)" : f.tiered ? "choose one (tiered)" : `choose ${n === 1 ? "one" : n}`;
      return askModes(card, f, opts, choose, again("mode"));
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
      // ("you may behold a Dragon": not beholding is the other choice)
      if (!ids.length && f.behold.optional) casting.behold = null;
      else if (!ids.length && !canPay) { cancelCast(); return rulesNote(`Not enough mana for ${f.name}.`); }
      else if (!ids.length) casting.behold = "pay";              // (nothing to behold: paying is the only way)
      else {
        const n = f.behold.count || 1;
        const alt = canPay ? { label: `Pay ${f.behold.orPay} instead`, value: "pay" } : f.behold.optional ? { label: "Don't behold", value: null } : null;
        return pickCards({ ids, min: n, max: n, confirm: "Behold", alt,
          prompt: `Behold ${n > 1 ? n + " " + f.behold.type + "s" : "a " + f.behold.type} for ${f.name}: choose on your battlefield or reveal from your hand.`,
          then: (picked) => again("behold")(Array.isArray(picked) ? (n > 1 ? picked : picked[0]) : picked) });
      }
    }
    // "As an additional cost, discard a card or pay {2}": a card from your hand, or pay
    if (f.discardCost && casting.discard === undefined) {
      const ids = state.player.hand.filter((c) => c.id !== card.id).map((c) => c.id);
      const canPay = f.discardCost.orPay && !E.check(state, { ...base, discard: "pay" });
      if (!ids.length && !canPay) { cancelCast(); return rulesNote(`${f.name} needs a card to discard.`); }
      if (!ids.length) casting.discard = "pay";
      else return pickCards({ ids, confirm: "Discard", alt: canPay ? { label: `Pay ${f.discardCost.orPay} instead`, value: "pay" } : null,
        prompt: `Discard a card from your hand for ${f.name}${f.discardCost.orPay ? `, or pay ${f.discardCost.orPay}` : ""}.`,
        then: (picked) => again("discard")(Array.isArray(picked) ? picked[0] : picked) });
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
      if (p.slots) p.slots.forEach((sl, slot) => {
        // (what the slot takes: "your planeswalker", "a creature or planeswalker you don't control")
        const noun = sl.targets === "planeswalker" ? "planeswalker" : sl.targets === "creature-or-planeswalker" ? "creature or planeswalker" : "creature";
        out.push({ kind: sl.targets, filter: sl.filter, count: ONE, src: f, part, slot,
          label: f.name, which: sl.filter && sl.filter.controller === "you" ? `your ${noun}` : sl.filter && sl.filter.controller === "opponent" ? `a ${noun} you don't control` : null });
      });
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
    if (casting.trigger || casting.index != null || casting.renew || casting.channel) return finishChoice(casting.results[0]);
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
    : casting.renew ? { type: "renew", id: casting.card.id, target }
    : casting.channel ? { type: "channel", id: casting.card.id, target }
    : casting.index != null ? { type: "activate", id: casting.card.id, index: casting.index, target, x: casting.x ?? undefined, crew: casting.crew ?? undefined, craft: casting.craft ?? undefined, discard: casting.discard ?? undefined, waterTap: casting.waterTap ?? undefined, blight: casting.blight ?? undefined }
    : { type: "cast", id: casting.card.id, face: casting.face ?? undefined, target, sac: casting.sac ?? undefined,
      mode: casting.mode ?? undefined, color: casting.color ?? undefined, x: casting.x ?? undefined, split: casting.split,
      blight: casting.blight ?? undefined, behold: casting.behold ?? undefined, convoke: casting.convoke ?? undefined,
      lifePips: casting.lifePips || undefined, bargain: casting.bargain ?? undefined, evidence: casting.evidence ?? undefined, faceDown: casting.faceDown || undefined, offspring: casting.offspring || undefined, gift: casting.gift || undefined,
      tapFor: casting.tapFor ?? undefined, warp: casting.warp || undefined, webSling: casting.webSling ?? undefined, discard: casting.discard ?? undefined, sneak: casting.sneak ?? undefined, teamwork: casting.teamwork || undefined };

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

  // A small box of buttons for a choice made while casting (side, modes, color, X, divided damage, scry). An option
  // about a card ([value, label, card]) shows that card with the label under it, like the stack does.
  // (about: the one card the whole question is about, shown above the buttons: "Proliferate: Gray Ogre?")
  function askChoice(title, options, then, { mandatory = false, about = null } = {}) {
    $("choice-title").textContent = title;
    const cards = options.some(([, , card]) => card);
    $("choice-options").classList.toggle("cardopts", cards);
    const aboutCards = [].concat(about || []).filter(Boolean);
    $("choice-about").replaceChildren(...aboutCards.map((card) => { const el = cardEl(card, { detached: true }); el.classList.remove("tapped"); return el; }));
    $("choice-about").hidden = !aboutCards.length;
    $("choice-options").replaceChildren(...options.map(([value, label, card]) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: cards ? "ghost cardopt" : "ghost" });
      if (cards && card) {
        const el = cardEl(card, { detached: true });
        el.classList.remove("tapped");
        b.append(el);
      }
      b.append(Object.assign(document.createElement("span"), { textContent: label }));
      // (letting go of a press-and-hold zoom on its card isn't a pick)
      b.addEventListener("click", () => { if (swallowClick) return; $("choice").hidden = true; then(value); });
      return b;
    }));
    $("choice-cancel").hidden = mandatory;
    $("choice").hidden = false;
  }
  $("choice-cancel").addEventListener("click", () => { $("choice").hidden = true; cancelCast(); setPrompt(current.prompt); });

  // Choosing modes ("choose one", "choose two", "one or more", spree, tiered): the card, large, with a see-through
  // button for each mode over its text. One mode: tapping it chooses it. Several: tap them on and off, then confirm.
  // (opts: the allowed answers, [value, label]; a value is a mode index, or a list of them)
  function askModes(card, f, opts, how, then) {
    const multi = opts.some(([v]) => Array.isArray(v));
    const keyOf = (v) => [].concat(v).slice().sort((a, b) => a - b).join(",");
    const byKey = new Map(opts.map(([v]) => [keyOf(v), v]));
    const usable = new Set(opts.flatMap(([v]) => [].concat(v)));
    let picked = [];
    $("choice-title").textContent = `${f.name}: ${how}`;
    setPrompt(multi ? `Choose the modes for ${f.name}, then confirm.` : `Choose a mode for ${f.name}.`);
    $("choice-about").hidden = true;
    $("choice-options").classList.remove("cardopts");
    const wrap = Object.assign(document.createElement("div"), { className: "modecard" });
    const shown = cardEl(card, { zoom: true, detached: true });
    shown.classList.remove("tapped");
    const list = Object.assign(document.createElement("div"), { className: "modepicks" });
    const confirm = multi ? Object.assign(document.createElement("button"), { type: "button", className: "primary modeconfirm" }) : null;
    const refresh = () => {
      list.querySelectorAll(".modepick").forEach((b) => b.classList.toggle("on", picked.includes(Number(b.dataset.mode))));
      if (!confirm) return;
      const ok = byKey.has(keyOf(picked));
      confirm.disabled = !ok;
      confirm.textContent = !picked.length ? "Choose modes" : ok ? `Cast with ${picked.length} mode${picked.length > 1 ? "s" : ""}` : "Can't cast with these";
    };
    f.modes.forEach((m, i) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "modepick" + (multi ? " multi" : "") });
      b.dataset.mode = i;
      b.disabled = !usable.has(i);
      b.textContent = `${m.plus ? m.plus + " — " : ""}${m.text || `Mode ${i + 1}`}`;
      b.addEventListener("click", () => {
        if (swallowClick) return;
        if (!multi) { $("choice").hidden = true; return then(byKey.get(keyOf(i))); }
        picked = picked.includes(i) ? picked.filter((x) => x !== i) : [...picked, i];
        refresh();
      });
      list.append(b);
    });
    if (confirm) confirm.addEventListener("click", () => { if (confirm.disabled) return; $("choice").hidden = true; then(byKey.get(keyOf(picked))); });
    wrap.append(shown, list);
    $("choice-options").replaceChildren(wrap, ...(confirm ? [confirm] : []));
    refresh();
    $("choice-cancel").hidden = false;
    $("choice").hidden = false;
  }

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

  // A card in any zone, by id (what a choice is about: the top of your library, a discarded card, an exiled one …)
  const anyCard = (id) => (id == null ? null : ["player", "opponent"].flatMap((side) =>
    ["battlefield", "hand", "library", "graveyard", "exile"].flatMap((z) => state[side][z] || [])).find((c) => c.id === id) || null);

  // Something of yours is waiting: a trigger's target ("when this dies, …"), or a scry/surveil choice
  function promptTrigger() {
    cancelCast();
    const p = E.pendingTrigger(state);
    if (p.kind === "scry") {
      casting = { trigger: true, card: null, results: [], picks: [] };
      const opts = E.legalActions(state).filter((a) => a.type === "scry").map((a) => [a, E.describe(state, a).replace(/^scry: /, "")]);
      // (the cards being looked at, top first, above the ways to arrange them)
      return askChoice(`${p.name} ${p.n}: what goes where?`, opts, (a) => { cancelCast(); perform(a); }, { mandatory: true, about: state.player.library.slice(0, p.n) });
    }
    // two replacement effects want to change the same event: you choose which applies (CR 616.1)
    if (p.kind === "choice") {
      casting = { trigger: true, card: null, results: [], picks: [] };
      // the cards it's about: one for the whole question (above the answers), or one per answer
      const perAnswer = Array.isArray(p.about) ? p.about.map(anyCard) : null;
      const about = perAnswer || !p.about ? null : p.about.all ? p.about.all.map(anyCard) : anyCard(p.about);
      return askChoice(p.name, p.labels.map((label, pick) => [{ type: "choice", pick }, label, perAnswer && perAnswer[pick]]),
        (a) => { cancelCast(); perform(a); }, { mandatory: true, about });
    }
    // several of your triggers at once: you choose which goes on the stack first (it resolves last)
    const order = E.legalActions(state).filter((a) => a.type === "order");
    if (order.length) {
      casting = { trigger: true, card: null, results: [], picks: [] };
      // (each trigger shown with its source card, as on the stack)
      const opts = order.map((a) => [a, `${state.pending[a.pick].name}'s trigger`, stackSource({ kind: "trigger", srcId: state.pending[a.pick].srcId, name: state.pending[a.pick].name })]);
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
      crew: ab.crew ? crewIds(card) : ab.stationAb ? crewIds(card).slice(0, 1) : undefined,
      discard: ab.discardCost ? (state.player.hand[0] || {}).id : undefined,
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
      const id = action.ids[i];
      const attacker = state.player.battlefield.find((c) => c.id === id);
      // (the attacker above the choice; each planeswalker or battle shown as its card)
      askChoice(`${attacker.name} attacks:`, [["opp", "Your opponent"], ...walkers.map((w) => [w.id, label(w), w])], (to) => {
        if (to !== "opp") action.at = { ...(action.at || {}), [id]: to };
        ask(i + 1);
      }, { mandatory: true, about: attacker });
    };
    if (walkers.length) return ask(0);
    setPrompt(current.prompt);
    perform(action);
  });

  /* ---------- resolving actions ---------- */
  // Animate on the current board, then swap in the engine's new state
  // Every action of this attempt, with how it reads ("cast Shock → opponent"): a creator's winning line is sent
  // with their submission as its solution (and replayed in the mod view to check it)
  let moves = [];
  function perform(action) {
    let text = "";
    try { text = E.describe(state, action); } catch (_) { /* (a description is only a label) */ }
    moves.push({ action: JSON.parse(JSON.stringify(action)), text });
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
      alt.hidden = false; alt.textContent = current.reviewing ? "Back to mod view" : current.custom ? "Back to creator" : "Back to puzzles"; alt.onclick = leaveGame;
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
    // a play-tested creator puzzle: the creator keeps the winning line (it unlocks submitting)
    if (current.tutorial) return tutorialWon();
    const created = current.custom && !current.reviewing;
    if (created && window.FindLethal.onCustomWin) window.FindLethal.onCustomWin(current, moves.slice());
    mark(current.id, "solved");
    const fresh = checkAchievements();
    confetti();
    $("sheet").classList.remove("fail", "long");
    $("sheet-title").textContent = "Lethal!";
    // achievements this win unlocked
    $("sheet-body").replaceChildren(...fresh.map((a) => {
      const d = document.createElement("div");
      d.className = "ach-new";
      d.innerHTML = RIBBON_SVG + `<span><small>Achievement unlocked</small><b></b></span>`;
      d.querySelector("b").textContent = a.name;
      return d;
    }));
    if (created) $("sheet-body").append(Object.assign(document.createElement("div"), { className: "sheet-note",
      textContent: "Your winning line is saved as this puzzle's solution. You can submit it from the creator now." }));
    const set = setOf(current.difficulty);
    // (daily puzzles: the next day not solved yet — older days first, then newer ones; none left: back to the grid)
    const at = set.indexOf(current);
    const next = current.date ? [...set.slice(at + 1), ...set.slice(0, at)].find((p) => progress[p.id] !== "solved") : set[at + 1];
    const btn = $("sheet-btn"), alt = $("sheet-alt");
    const toLevels = () => showLevels(current.difficulty);
    alt.hidden = false;
    if (current.reviewing) {
      btn.textContent = "Back to mod view"; btn.onclick = showMod;
      alt.textContent = "Play again"; alt.onclick = load;
    } else if (current.custom) {
      btn.textContent = "Back to creator"; btn.onclick = () => showCreator();
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

  // A submitted solution ({ steps: [{ action, text }] }) as numbered lines, without the turn-step moves
  const solutionText = (sol) => ((sol && sol.steps) || []).filter((m) => m.text && m.action.type !== "advance")
    .map((m, i) => `${i + 1}. ${m.text}`).join("\n") || "(no steps)";
  // Replays a submitted solution on a fresh board: does it really win? (moves the creator's browser recorded)
  function replayWins(puzzleDef, sol) {
    try {
      let s = E.init(puzzleDef);
      for (const m of (sol && sol.steps) || []) {
        if (E.check(s, m.action)) return false;
        s = E.apply(s, m.action).state;
        if (E.won(s)) return true;
      }
      return E.won(s);
    } catch (_) { return false; }
  }

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
        (current.solution ? `The creator's winning line:\n${solutionText(current.solution)}\n\n` : "") +
        (plans.length ? `Winning line${plans.length > 1 ? "s" : ""} (any order that's legal works):\n${plans.join("\n")}` : "No winning line found.");
    }, 30);
  });

  /* ---------- tutorial: the controls, one action at a time (first visit, or "Tutorial" in the menu) ---------- */
  // A tiny real puzzle: each step says what to do in a few words, lights up where, and moves on once it's done.
  const TUTORIAL = "find-lethal:tutorial-done";
  let tut = null;                                            // { i: step, seen: { zoom, zone, reset } }
  const tutBoard = () => {
    const { c, puzzle } = window.CARD_CATALOG;
    return Object.assign(puzzle({ id: "tutorial", title: "Tutorial", difficulty: "easy",
      opp: { life: 4 }, you: { hand: [c("Mountain"), c("Shock")], battlefield: [c("Furnace Gremlin"), c("Mountain"), c("Mountain")] } }),
    { custom: true, tutorial: true });
  };
  const inPlay = (id) => state && state.player.battlefield.some((x) => x.id === id);
  const gremlin = () => state && state.player.battlefield.find((x) => x.id === "furnace-gremlin");
  const shockGone = () => state && (state.stack.some((x) => x.id === "shock") || state.player.graveyard.some((x) => x.id === "shock"));
  const shockDone = () => state && !state.stack.length && state.player.graveyard.some((x) => x.id === "shock");
  const pumped = () => gremlin() && E.power(gremlin()) >= 2;
  const resolveButton = () => (!$("stackview").hidden ? $("stack-resolve") : $("go"));
  const handCard = (id) => document.querySelector(`#hand .card[data-id="${id}"]`);
  const myCard = (id) => document.querySelector(`#you-lane .card[data-id="${id}"]`);
  const TUT_STEPS = [
    { text: "Tap the Mountain in your hand to play it.", at: () => handCard("mountain-3"), done: () => inPlay("mountain-3") },
    { text: "Messed up? ↺ starts over. Tap it.", at: () => $("reset"), done: () => tut.seen.reset },
    { text: "Play the Mountain again.", at: () => handCard("mountain-3"), done: () => inPlay("mountain-3") },
    { text: "Press and hold a card to see it big.", at: () => myCard("furnace-gremlin"), done: () => tut.seen.zoom },
    { text: "Tap Shock to cast it.", at: () => handCard("shock"), done: () => (casting && casting.card && casting.card.id === "shock") || shockGone() },
    { text: "Now tap their life to aim at them.", at: () => $("opp-life"), done: shockGone },
    { text: "Spells wait on the stack. Tap Resolve.", at: resolveButton, done: shockDone },
    { text: "Cards can have buttons. Tap {1}{R}: +1/+0.", at: () => myCard("furnace-gremlin") && myCard("furnace-gremlin").querySelector(".abil"),
      done: () => pumped() || (state && state.stack.length > 0) },
    { text: "Resolve it.", at: resolveButton, done: () => pumped() && !state.stack.length },
    { text: "Hold your graveyard to look inside.", at: () => $("you-gy"), done: () => tut.seen.zone },
    { text: "Tap Close.", at: () => $("zone-close"), done: () => tut.seen.zone && $("zoneview").hidden },
    { text: "Tap Next phase.", at: () => $("next-phase"), done: () => state && state.phase !== "main1" },
    { text: "Tap your Gremlin to attack with it.", at: () => myCard("furnace-gremlin"), done: () => selected.has("furnace-gremlin") || !!(state && state.combat) },
    { text: "Tap Declare attackers.", at: () => $("go"), done: () => !!(state && state.combat) },
    { text: "No blockers. Here comes the damage…", at: () => null, done: () => false }
  ];
  function startTutorial() {
    tut = { i: 0, seen: {}, loads: 0 };
    $("coach").hidden = false;
    play(tutBoard());
    tutTick();
  }
  // a fresh board: the reset step is done; any other restart (a failed try) goes back to "play the Mountain again"
  function tutorialLoaded() {
    if (!tut) return;
    if (tut.loads++ === 0) return;
    if (tut.i === 1) tut.seen.reset = true;
    else if (tut.i > 2) { tut.i = 2; tut.seen.zone = false; }
  }
  const tutorialSaw = (what) => { if (tut && current && current.tutorial) tut.seen[what] = true; };
  function tutTick() {
    if (!tut) return;
    while (tut.i < TUT_STEPS.length - 1 && TUT_STEPS[tut.i].done()) tut.i++;
    const step = TUT_STEPS[tut.i];
    $("coach-text").textContent = step.text;
    $("coach-step").textContent = `${Math.min(tut.i + 1, TUT_STEPS.length - 1)} / ${TUT_STEPS.length - 1}`;
    document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
    const target = step.at();
    if (target) target.classList.add("coach-target");
    // the bubble sits away from what it points at (top half → bubble low, and the other way round)
    const r = target && target.getBoundingClientRect();
    const low = !!r && r.top + r.height / 2 < innerHeight * 0.45;
    $("coach").classList.toggle("low", low);
    // (low: just above the bottom bar, so the bar's own text stays readable)
    $("coach").style.bottom = low ? `${Math.max(8, innerHeight - document.querySelector(".bar").getBoundingClientRect().top + 10)}px` : "";
    setTimeout(tutTick, 250);
  }
  function tutorialWon() {
    confetti();
    tut = null;
    $("coach").hidden = true;
    document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
    $("sheet").classList.remove("fail", "long");
    $("sheet-title").textContent = "Lethal!";
    $("sheet-body").textContent = "That's every control. Now find lethal for real.";
    const btn = $("sheet-btn");
    btn.textContent = "Let's play"; btn.onclick = finishTutorial;
    $("sheet-alt").hidden = true;
    $("sheet").hidden = false;
  }
  function finishTutorial() {
    tut = null;
    $("coach").hidden = true;
    document.querySelectorAll(".coach-target").forEach((el) => el.classList.remove("coach-target"));
    try { localStorage.setItem(TUTORIAL, "1"); } catch (_) { /* fine */ }
    showMenu();
  }
  $("coach-skip").addEventListener("click", finishTutorial);
  $("show-tutorial").addEventListener("click", startTutorial);
  let tutorialSeen = false;
  try { tutorialSeen = localStorage.getItem(TUTORIAL) === "1"; } catch (_) { tutorialSeen = true; }

  checkAchievements();                                     // (earlier progress may already have reached some)

  // ?p=<id> jumps straight into a puzzle; otherwise start at the menu
  // (a daily puzzle only from its day on)
  const deep = window.PUZZLES.find((p) => p.id === new URLSearchParams(location.search).get("p") && !(p.date && p.date > today()));
  // (the first visit starts with the tutorial)
  if (deep) play(deep); else if (/[?&]mod\b/.test(location.search)) showMod(); else if (!tutorialSeen || /[?&]tutorial\b/.test(location.search)) startTutorial(); else showMenu();
  loadUserPuzzles();
})();
