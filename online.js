/* Online puzzle submissions (Supabase, through its REST API — no library needed).
 *
 * Table "submissions" (tools/supabase-setup.sql): anyone may add a pending submission and read accepted ones;
 * only a logged-in moderator (listed in "mods") may read everything and accept or decline. Those rules live in
 * the database (row level security), so the keys below are safe to publish: they only identify the project.
 */
window.Online = (() => {
  "use strict";
  // Filled in once the Supabase project exists (Project Settings → API: the project URL and the public key)
  const URL = "https://angolesgtievvhebycbj.supabase.co";
  const KEY = "sb_publishable_1hefawuqVlL_rGUNcXQU6g_TTPNvUrT";
  const ready = !!(URL && KEY);

  const SESSION = "find-lethal:mod-session";
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SESSION) || "null"); } catch (_) { /* no saved login */ }
  const keepSession = (s) => {
    session = s;
    try { if (s) localStorage.setItem(SESSION, JSON.stringify(s)); else localStorage.removeItem(SESSION); } catch (_) { /* fine */ }
  };

  async function call(path, { method = "GET", body, auth = false, prefer } = {}) {
    if (!ready) throw new Error("Online submissions aren't set up yet.");
    const headers = { apikey: KEY, "Content-Type": "application/json" };
    if (auth) {
      if (!session) throw new Error("Log in first.");
      if (session.expires_at && session.expires_at * 1000 < Date.now() + 60000) await refresh();
      headers.Authorization = "Bearer " + session.access_token;
    }
    if (prefer) headers.Prefer = prefer;
    const r = await fetch(URL + path, { method, headers, body: body == null ? undefined : JSON.stringify(body) });
    const text = await r.text();
    const data = text ? JSON.parse(text) : null;
    if (!r.ok) throw new Error((data && (data.message || data.msg || data.error_description || data.error)) || `Server error ${r.status}`);
    return data;
  }

  // Moderator login (email + password: the account made in the Supabase dashboard)
  async function login(email, password) {
    const s = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } });
    keepSession(s);
    return s;
  }
  async function refresh() {
    try {
      const r = await fetch(URL + "/auth/v1/token?grant_type=refresh_token", { method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: session.refresh_token }) });
      if (!r.ok) throw new Error();
      keepSession(await r.json());
    } catch (_) { keepSession(null); throw new Error("Your login ran out. Log in again."); }
  }
  const logout = () => keepSession(null);

  // Titles and author names may not contain slurs, hate terms or profanity — also written with numbers or symbols for
  // letters, s p a c e d out, or stretched (fuuuck). The database checks the same list (tools/supabase-protect.sql,
  // fl_offensive: keep the two in step); this copy only tells the player before sending.
  const BLOCK_ANYWHERE = ["nigger", "nigga", "niggah", "faggot", "wetback", "beaner", "chingchong", "raghead", "towelhead", "spearchucker",
    "junglebunny", "porchmonkey", "shemale", "fuck", "cunt", "whore", "bitch", "slut", "bullshit", "shithead", "shitty", "asshole", "dickhead",
    "cocksucker", "blowjob", "handjob", "dildo", "porn", "pussy", "penis", "vagina", "molest", "pedophil", "paedophil",
    "nazi", "hitler", "siegheil", "heilhitler", "kkk", "whitepower", "gaschamber", "killyourself",
    "kanker", "klootzak", "neuk", "flikker", "mongool", "nikker", "kutwijf", "tyfus", "hoerenzoon", "godverdomme"];
  // (short words that are also parts of innocent ones — Assassin, Cockatrice, Raccoon, Spicy, Grape — only as whole words)
  const BLOCK_WHOLE = ["ass", "arse", "dick", "cock", "coon", "coons", "spic", "spics", "chink", "chinks", "gook", "gooks", "kike", "kikes",
    "paki", "pakis", "dyke", "dykes", "tranny", "trannies", "fag", "fags", "homo", "homos", "rape", "raped", "raping",
    "rapist", "rapists", "retard", "retards", "retarded", "pedo", "pedos", "kys", "cum", "tits", "twat", "wank",
    "negro", "negroes", "neger", "jap", "japs", "nig", "nigs", "heil", "kut", "lul", "hoer", "tering", "shit", "shits"];
  const LEET = { 0: "o", 1: "i", 3: "e", 4: "a", 5: "s", 7: "t", 8: "b", "@": "a", $: "s", "!": "i", "|": "i" };
  // a word as a pattern where each letter may be stretched, but doubled letters stay doubled: fuck → f+u+c+k+,
  // mongool → m+o+n+g+o{2,}l+ (so "fuuuck" matches and "Mongol" doesn't)
  const stretch = (w) => w.replace(/(.)\1*/g, (run, ch) => (run.length > 1 ? `${ch}{${run.length},}` : `${ch}+`));
  const ANYWHERE_RE = BLOCK_ANYWHERE.map((w) => new RegExp(stretch(w))), WHOLE_RE = BLOCK_WHOLE.map((w) => new RegExp(`^${stretch(w)}$`));
  function offensive(text) {
    const low = String(text || "").toLowerCase().replace(/[0134578@$!|]/g, (ch) => LEET[ch]);
    const joined = low.replace(/[^a-z]/g, ""), words = low.split(/[^a-z]+/).filter(Boolean);
    return ANYWHERE_RE.some((re) => re.test(joined)) || WHOLE_RE.some((re) => words.some((w) => re.test(w)));
  }

  const COLUMNS = "id,created_at,title,author,tier,puzzle,solution,status,reviewed_at";
  return {
    ready,
    offensive,
    loggedIn: () => !!session,
    login, logout,
    // a new submission: { title, author, tier, puzzle, solution }
    submit: (s) => call("/rest/v1/submissions", { method: "POST", body: { ...s, status: "pending" }, prefer: "return=minimal" }),
    // everyone: the accepted puzzles, oldest first (new ones go at the end of the group)
    accepted: () => call(`/rest/v1/submissions?status=eq.accepted&select=${COLUMNS}&order=reviewed_at.asc`),
    // moderators: submissions with this status, newest first
    list: (status) => call(`/rest/v1/submissions?status=eq.${status}&select=${COLUMNS}&order=created_at.desc`, { auth: true }),
    review: (id, fields) => call(`/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", auth: true,
      body: { ...fields, reviewed_at: new Date().toISOString() }, prefer: "return=minimal" }),
    // moderators: delete a submission for good
    remove: (id) => call(`/rest/v1/submissions?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", auth: true, prefer: "return=minimal" })
  };
})();
